# Partial audit: CI and testing

Change: `windows-platform-compatibility`
Specs: `default:_global/continuous-integration`, `default:_global/testing`
Mode: read-only. Sources: `specd changes spec-preview` plus the working tree (uncommitted). Graph index was stale; navigation used the listed files and targeted searches. No code or spec files were modified.

Checked artifacts:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitattributes`
- root `package.json` (`test`, `preflight:test`, `lint-staged`, `typecheck`, `build`)
- `pnpm-workspace.yaml` `onlyBuiltDependencies`
- `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
- suite scan for `chmod` / `0o000`, `/tmp`, `/var/www`, `file:///tmp/`, `os.tmpdir()` / `mkdtemp`, snapshots, Jest

---

### default:\_global/continuous-integration

#### Requirements

1. **Workflow file is tracked.** The repo must track `.github/workflows/ci.yml` without tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` stay ignored.
2. **Three operating systems.** The same job runs on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any runner fails the check.
3. **When the workflow runs.** Pull requests and pushes to `main`. It must not call Gemini workflows.
4. **Toolchain install.** Checkout, pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`. That install builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. No apt, brew, or Chocolatey packages.
5. **Checks.** Each job runs `pnpm typecheck`, `pnpm build`, then `pnpm test`. `typecheck` and `build` skip `@specd/public-web`. `pnpm test` includes `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and the five `@specd/plugin-agent-*` packages. It excludes `@specd/mcp` and `@specd/public-web`. No changeset status and no publish.

Related change contract (not separate CI requirements): `.gitattributes` is `* text=auto eol=lf` plus `*.md`, `*.yaml`, `*.yml`, `*.json` `eol=lf`. `lint-staged` typecheck is `pnpm typecheck`, not `bash -c`. `@ladybugdb/core` must not be restored to `onlyBuiltDependencies`; note if absent.

#### Implementation status

| Requirement              | Status                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflow file is tracked | Met for ignore rules; file not in the index yet | `.gitignore` is `.github/*`, `!.github/workflows/`, `!.github/workflows/**`. `git check-ignore -q .github/workflows/ci.yml` exits 1 (not ignored). `git check-ignore -q .github/copilot-instructions.md` exits 0 (ignored by `.github/*`). `.agents/` and `skills-lock.json` stay ignored. `.github/workflows/` contains only `ci.yml`. `git status` shows `?? .github/` and `git ls-files` does not list it, so it is untracked until this change is committed. The verify scenario is about ignore evaluation, which passes. |
| Three operating systems  | Met                                             | `jobs.check.strategy.matrix.os` is `[macos-latest, ubuntu-latest, windows-latest]`. `runs-on: ${{ matrix.os }}`. Same steps on every OS. `fail-fast: false`. No `continue-on-error`. GitHub marks the workflow failed when any matrix job fails; `fail-fast: false` only lets the other jobs finish.                                                                                                                                                                                                                           |
| When the workflow runs   | Met                                             | `on.pull_request` (default activity, including open and synchronize) and `on.push.branches: [main]`. No `workflow_call`, no Gemini job, no Gemini file on disk.                                                                                                                                                                                                                                                                                                                                                                |
| Toolchain install        | Met                                             | Steps: `actions/checkout@v4`, `pnpm/action-setup@v4` version `10.6.5` (matches root `packageManager`), `actions/setup-node@v4` `node-version: 22` with `cache: pnpm`, `pnpm install --frozen-lockfile`. No apt, brew, or choco. `onlyBuiltDependencies` lists `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, `better-sqlite3`, `esbuild`, plus `core-js` and `core-js-pure`.                                                                                                                              |
| Checks                   | Met                                             | Job order is `pnpm typecheck`, `pnpm build`, `pnpm test`. Root `typecheck` and `build` use `--filter=!@specd/public-web`. Root `test` filters are exactly the twelve packages named in the spec. `@specd/mcp` and `@specd/public-web` are absent. `preflight:test` is `pnpm test`, so it inherits those filters. The workflow does not run changeset or publish (`preflight:changeset` remains a local script and is not a CI step).                                                                                           |
| `.gitattributes`         | Met (change contract)                           | `* text=auto eol=lf`, then `*.md`, `*.yaml`, `*.yml`, `*.json` with `text eol=lf`. New untracked file. No binary types marked as text.                                                                                                                                                                                                                                                                                                                                                                                         |
| `lint-staged`            | Met (change contract)                           | `*.ts` is `eslint --fix`, `prettier --write`, `pnpm typecheck`. No `bash -c` in `package.json` or `ci.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@ladybugdb/core`        | Note only                                       | Working-tree diff deletes `- '@ladybugdb/core'` from `onlyBuiltDependencies`. The name is absent from `pnpm-workspace.yaml`, root `package.json`, and `pnpm-lock.yaml`. It was not restored. The CI spec's native-module list does not include it.                                                                                                                                                                                                                                                                             |

#### Discrepancies

None against the five CI requirements.

Observations (not counted as discrepancies):

- `ci.yml` and `.gitattributes` are untracked. Ignore rules allow `ci.yml` to be added. Tracking in the index happens when the change is committed.
- `fail-fast: false` is allowed. The check still fails if the Windows job fails, because no step sets `continue-on-error`.
- Node is `22`, not a pinned `22.x.y`. The spec says Node 22.

`@ladybugdb/core` absence is recorded above and is not a miss against the listed native modules.

#### Test coverage

No Vitest (or other in-repo test) asserts the workflow, the gitignore negation, or the root script filters. Coverage is file inspection plus `git check-ignore`.

| Verify scenario                                 | Covered by                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Only workflows are re-included                  | `git check-ignore` on `ci.yml` (not ignored) and `copilot-instructions.md` (ignored) |
| One red runner fails the check                  | Workflow shape only. No `continue-on-error`. Not executed on GitHub in this audit    |
| Pull request starts the workflow / push to main | `on:` block. Not executed                                                            |
| Native modules come from pnpm install           | Step list plus `onlyBuiltDependencies`. Install was not run here                     |
| Three commands in order                         | Step order in `ci.yml`                                                               |
| `pnpm test` package set                         | Root `test` script string                                                            |

#### Missing tests

- No test that Git ignores `.github/copilot-instructions.md` and does not ignore `.github/workflows/ci.yml`.
- No test that `ci.yml` contains the three runners, the trigger set, the toolchain pins, and the command order.
- No test that a failed matrix job fails the workflow (GitHub aggregation).
- No test that root `test` / `preflight:test` filters match the spec package list and omit `@specd/mcp` and `@specd/public-web`.

#### Spec dependency chain

Depends on `default:_global/testing` (CI runs that Vitest suite). See the testing section: filesystem temp dirs sampled use `os.tmpdir()`, and `get-graph-health.spec.ts` does not use `chmod 0o000`. Hardcoded `/tmp` strings remain in other tests. If any of those strings are resolved as real paths, the Windows matrix job can fail for a reason the testing spec already forbids. Mocked string comparisons do not by themselves fail on Windows.

---

### default:\_global/testing

#### Requirements

1. **Test runner.** Vitest only. Tests live under package `test/`, mirroring `src/`, suffix `.spec.ts`.
2. **Unit tests for domain and application layers.** Every invariant-enforcing use case and entity method has a unit test. Ports are mocked. Unit tests do not touch the filesystem, network, or processes.
3. **Port mocks are typed.** Full port interface. No `{ ... } as unknown as Port`. Unused methods throw `new Error('not implemented')`.
4. **Integration tests for infrastructure adapters.** Real temp directories via `os.tmpdir()` plus a unique subfolder, removed after each test.
5. **Fixtures are valid on Windows.** Filesystem tests locate temp directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`. An unreadable file must not use `chmod 0o000` on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.
6. **Test naming.** `.spec.ts` matching the source name. Behaviour descriptions use `given / when / then`. Helpers are `setup<Thing>` / `cleanup<Thing>`.
7. **No snapshot tests.** No `toMatchSnapshot` or `toMatchInlineSnapshot`.

This change adds requirement 5. Requirements 1–4, 6, and 7 are the pre-existing conventions. They were spot-checked, not re-audited for every use case.

#### Implementation status

| Requirement                                         | Status                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test runner                                         | Met on spot check               | Root devDependency `vitest`. No `from 'jest'` under `packages/`. No `packages/**/src/**/*.spec.ts`. No `*.test.ts` under `packages/`.                                                                                                                                                                                                                                                                      |
| Unit tests for domain and application               | Not re-audited                  | Pre-existing. This partial did not enumerate every entity method.                                                                                                                                                                                                                                                                                                                                          |
| Port mocks are typed                                | Not met (standing)              | `as unknown as` appears in 67 `*.spec.ts` files. `get-graph-health.spec.ts`, which this change edits, still has 10 `as unknown as` casts, including `as unknown as CodeGraphHostPort` on the provider mock.                                                                                                                                                                                                |
| Integration temp dirs                               | Met for sampled creators        | `mkdtemp` / `mkdtempSync` hits use `os.tmpdir()` (`get-graph-health.spec.ts`, `move-dir.spec.ts`, `write-atomic.spec.ts`, sqlite store specs, isolated-worker specs). `get-graph-health` removes its temp root in `finally` via `rmSync`. Full adapter cleanup was not re-audited.                                                                                                                         |
| Fixtures are valid on Windows — temp dirs and chmod | Met for the change's named case | `get-graph-health.spec.ts` creates dirs with `mkdtempSync(join(tmpdir(), ...))`. Unreadable content is a `vi.mock` of `node:fs/promises` `readFile` that throws `EACCES` when the path is in `deniedReads`. Repo search found no `chmod`, `chmodSync`, or `0o000`. No `file:///tmp` or `/var/www` under `packages/**/*.{ts,js}`. Worker specs build module URLs with `pathToFileURL(join(tmpdir(), ...))`. |
| Fixtures are valid on Windows — hardcoded `/tmp`    | Partial                         | 29 `*.spec.ts` files still contain `'/tmp...'` string literals. Two test helpers pass `configPath: '/tmp'` into repository stubs (`packages/core/test/application/use-cases/helpers.ts`, `packages/code-graph/test/helpers/stub-change-repository.ts`). These are mocked paths and expected CLI arguments, not `mkdtemp('/tmp')`.                                                                          |
| Test naming                                         | Not re-audited                  | Suffix spot check found `.spec.ts` and no `.test.ts`. Description wording was not sampled.                                                                                                                                                                                                                                                                                                                 |
| No snapshot tests                                   | Met on search                   | No `toMatchSnapshot` or `toMatchInlineSnapshot` under `packages/**/*.spec.ts`.                                                                                                                                                                                                                                                                                                                             |

#### Discrepancies

**D1. Hardcoded `/tmp` strings remain after the Windows fixture requirement.**

- Spec: "Tests MUST NOT depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...` paths." Verify scenario: when a filesystem test creates a temporary directory, it is under `os.tmpdir()` and does not hardcode `/tmp` or `file:///tmp/`.
- Code: creating a temp directory uses `os.tmpdir()`. `/var/www` and `file:///tmp` are gone. `'/tmp/...'` remains in these spec files:
  - `packages/cli/test/commands/change.spec.ts`
  - `packages/cli/test/commands/change-create.spec.ts`
  - `packages/cli/test/commands/graph-hotspots.spec.ts`
  - `packages/cli/test/commands/graph-impact.spec.ts`
  - `packages/cli/test/commands/graph-index.spec.ts`
  - `packages/cli/test/commands/graph-search.spec.ts`
  - `packages/cli/test/commands/graph-stats.spec.ts`
  - `packages/cli/test/commands/schema-extend.spec.ts`
  - `packages/cli/test/commands/schema-fork.spec.ts`
  - `packages/cli/test/commands/schema-show.spec.ts`
  - `packages/code-graph/test/application/services/bootstrap-graph-config.spec.ts`
  - `packages/core/test/application/use-cases/archive-change.spec.ts`
  - `packages/core/test/application/use-cases/archive-change-batch-restore.spec.ts`
  - `packages/core/test/application/use-cases/get-active-schema.spec.ts`
  - `packages/core/test/application/use-cases/get-config.spec.ts`
  - `packages/core/test/application/use-cases/get-project-metadata.spec.ts`
  - `packages/core/test/composition/actor-resolver.spec.ts`
  - `packages/core/test/composition/kernel-get-config.spec.ts`
  - `packages/core/test/composition/use-cases/archive-change.spec.ts`
  - `packages/core/test/composition/use-cases/get-config.spec.ts`
  - `packages/core/test/composition/use-cases/update-implementation-tracking.spec.ts`
  - `packages/core/test/composition/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/node/hook-runner.spec.ts`
  - `packages/core/test/infrastructure/vcs-actor-resolver.spec.ts`
  - `packages/plugin-manager/test/application/install-plugin.spec.ts`
  - `packages/plugin-manager/test/application/update-plugin.spec.ts`
  - `packages/sdk/test/composition/host-context.spec.ts`
  - `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
  - `packages/skills/test/resolve-bundle.spec.ts`
- Both readings:
  - **Implementation gap:** task 9.5 and the requirement's second sentence say tests must not depend on hardcoded `/tmp`. These files still embed that prefix. CLI cases pass `--path /tmp/repo` into the program. If the code under test `path.resolve`s that string, Windows yields a different absolute path than the assertion.
  - **Spec broader than the scenario:** the verify scenario fires when a filesystem test creates a directory. The remaining hits are stub config objects and mocked return paths (`projectRoot: '/tmp/project'`, `changePath: '/tmp/change'`). They do not create `/tmp`. String equality still passes on Windows. The spec could be narrowed to "directories and file URLs the test actually creates," which would match the code that was changed.
- `get-graph-health.spec.ts` is not in this list. Its real directories use `os.tmpdir()`.

**D2. `chmod 0o000` replacement matches the prohibition; the "unreadable file" alternative is a mock.**

- Spec: do not use `chmod 0o000` as the Windows unreadable condition. Produce a file the process cannot read, or skip where the bit has no effect.
- Code: `get-graph-health.spec.ts` never chmods. It writes a normal file under `os.tmpdir()` and mocks `readFile` to throw `EACCES` for that path. The assertion is `FreshnessState.Unknown` / `CONTENT_UNKNOWN`, not `CONTENT_DIRTY`.
- Both readings:
  - **Code matches the intent:** the condition is "read failed," which is true on Windows without chmod. The prohibition is satisfied. Repo-wide search found no `0o000`.
  - **Spec's allowed substitutes are narrower:** a mock does not make the OS deny the read, and the test is not skipped on `win32`. A strict reading would want an ACL/icacls setup or `it.skip` on Windows. The mock is the more portable of the two and is what the change implemented.

**D3. Typed port mocks (standing, including a file this change touched).**

- Spec: no partial mock with `as unknown as Port`.
- Code: 67 spec files still use `as unknown as`. `get-graph-health.spec.ts` has 10, including the provider double used by the new unreadable-file case.
- Both readings:
  - **Implementation gap:** the global testing spec is still violated, including in the Windows fixture test.
  - **Spec is older and widely unmet:** this change did not claim to retype every port double. Treating D3 as a release blocker for Windows CI would expand the change far past fixtures. It remains a real spec/code gap.

#### Test coverage

| Requirement / scenario                  | Coverage                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temp paths come from the OS             | `get-graph-health.spec.ts` and other `mkdtemp(Sync)(join(tmpdir(), ...))` tests create real dirs under `os.tmpdir()`. No test asserts the absence of `'/tmp'` literals.                  |
| Unreadable files do not use chmod zero  | The health spec covers the outcome (read error stays `CONTENT_UNKNOWN`) via `deniedReads`. Nothing asserts "this file does not call chmod." The prohibition holds because chmod is gone. |
| Jest rejected / tests outside `test/`   | No dedicated guard test found in this pass. Layout spot check is clean.                                                                                                                  |
| Unit test must not touch the filesystem | Not re-checked. The health spec's read-error case is an integration-style temp dir inside a use-case spec.                                                                               |
| Partial mock cast                       | The forbidden pattern is still what many tests, including the health spec, use. No test fails the build when `as unknown as` appears.                                                    |
| Integration cleanup                     | Health spec uses `try/finally` + `rmSync`. Not all adapters were re-read.                                                                                                                |
| Wrong suffix / snapshot assertion       | Search found no `.test.ts` and no snapshot matchers. No meta-test enforces that.                                                                                                         |

#### Missing tests

- No suite-wide assertion that spec files do not contain `'/tmp'`, `'/var/www'`, or `file:///tmp/`.
- No Windows job assertion, in-repo, that `get-graph-health` avoids `chmod 0o000` (behavior is covered; the forbidden API is not).
- No test that port doubles implement every method without `as unknown as`.
- Pre-existing verify scenarios (Jest import, co-located spec file, snapshot matcher, integration `afterEach` cleanup) have no single compliance test; they rely on review and the suite's current shape.

#### Spec dependency chain

Depends on `default:_global/architecture` (what is unit vs integration) and `default:_global/conventions` (ESM, why Vitest). Those specs were not expanded in this partial. No contradiction found between the new Windows fixture text and the CI spec: CI runs `pnpm test` on `windows-latest`, which is the suite this requirement constrains.

---

## Summary counts

| Item                        | Count                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| Specs audited               | 2                                                                            |
| Requirements                | 12 (CI 5, testing 7)                                                         |
| Requirements met            | 8 (CI 5; testing: runner, sampled integration temp dirs, snapshot ban)       |
| Requirements partial        | 1 (Windows fixtures: chmod and real temp dirs met; `/tmp` strings remain)    |
| Requirements not re-audited | 2 (unit-test completeness, test naming wording)                              |
| Requirements not met        | 1 (typed port mocks, standing)                                               |
| Discrepancies               | 3 (D1 `/tmp` strings, D2 mock vs OS-unreadable wording, D3 `as unknown as`)  |
| CI discrepancies            | 0                                                                            |
| Notes (not discrepancies)   | 2 (`ci.yml` untracked but not ignored; `@ladybugdb/core` removed and absent) |
| Missing test areas          | 8 (4 CI workflow/script guards, 4 testing fixture/mock/naming guards)        |
