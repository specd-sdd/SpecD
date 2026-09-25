# CI and testing specs

Read-only audit of requirements this change added or modified in `default:_global/testing`, `default:_global/continuous-integration`, `default:_global/docs`, `core:workspace`, and `core:spec-id-format`. Spec text is the change `spec-preview` (`--artifact specs`). Neither the spec nor the code was treated as automatically right.

`@ladybugdb/core` is absent from `pnpm-workspace.yaml` `onlyBuiltDependencies`. That absence is an intended non-goal and is not a discrepancy.

Change-name rejection lives in `core:change`, which is outside this batch. The device-name helper is shared, and `change-device-name.spec.ts` rejects `con` and `com1` and accepts `con-foo`. That observation is not counted here.

## Requirements checked

### 1. `default:_global/testing` — Fixtures are valid on Windows (temp paths and file URLs)

Filesystem tests must locate temporary directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`.

**Status: met.**

Created fixtures use `os.tmpdir()` / `tmpdir()` plus `mkdtemp` or `mkdtempSync` (for example `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `spec-repository.spec.ts`, `change-repository.spec.ts`, and `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`). Worker and barrel tests build module URLs with `pathToFileURL(join(tmpdir(), ...))` in `barrel.spec.ts`, `signals.spec.ts`, `supervisor.spec.ts`, and `dist.spec.ts`.

A repo search of `*.{ts,js,mjs}` found no `/var/www`, no `file:///tmp`, and no `mkdtemp`, `mkdir`, or `writeFile` call aimed at a literal `/tmp` path. `protocol.spec.ts` uses the literal `file:///task.js` as a JSON envelope for `isStartMessage`. That string is not `file:///tmp` and the test does not create a file there.

Leftover `'/tmp/...'` strings remain in mocks, stub return values, and expected CLI arguments (for example `changePath: '/tmp/test-changes/my-change'` in `change-create.spec.ts`, and `path: '/tmp/changes/add-auth'` in `hook-runner.spec.ts`). Those tests do not create a fixture at `/tmp`. Per this change they are non-goals and are not flagged.

### 2. `default:_global/testing` — Unreadable files do not use `chmod 0o000`

A test that needs an unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.

**Status: met.**

`get-graph-health.spec.ts` creates the directory with `mkdtempSync(join(tmpdir(), ...))`, writes a real file, and then mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. A search of `*.{ts,js,mjs}` found no `chmod`, `chmodSync`, or `0o000`.

### 3. `default:_global/continuous-integration` — Workflow file is tracked

The repository must track `.github/workflows/ci.yml`. Tracking that directory must not require tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` must stay ignored. Gemini workflow files under `.github/workflows/` must not be ignored if they are added later.

**Status: met.**

`.gitignore` is:

```
.github/*
!.github/workflows/
!.github/workflows/**
```

`git check-ignore -q` reports `.github/workflows/ci.yml` and a hypothetical `.github/workflows/gemini-review.yml` as not ignored. It reports `.github/copilot-instructions.md`, `.github/skills/foo`, `.agents/foo`, and `.claude/skills/x` as ignored. Agent directories (`.agents/`, `.claude/`, `.codex/`, `.opencode/`, `.gemini/`) and `skills-lock.json` stay ignored.

`ci.yml` is untracked in the index (`?? .github/`) because this change is not committed. The verify scenario is the ignore rule, which matches. Uncommitted state is not a discrepancy.

### 4. `default:_global/continuous-integration` — Three operating systems

`ci.yml` must run the same job on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any one runner must fail the check.

**Status: met.**

One `check` job uses `strategy.matrix.os: [macos-latest, ubuntu-latest, windows-latest]` and the same step list on every runner. `fail-fast: false` still fails the workflow when any matrix job fails; it only keeps the other runners going. That matches the allowed reading of this requirement.

### 5. `default:_global/continuous-integration` — When the workflow runs

The workflow must run on pull requests and on pushes to `main`. It must not call the Gemini workflows.

**Status: met.**

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

Default `pull_request` includes opened and synchronize (updated). The file has no `workflow_call`, no Gemini job, and no step that invokes a Gemini workflow.

### 6. `default:_global/continuous-integration` — Toolchain install

Each job must check out the repository, install the pnpm `10.6.5` binary, install Node 22, and run `pnpm install --frozen-lockfile`. That install is what builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. The workflow must not install extra apt, brew, or Chocolatey packages.

**Status: met.**

`ci.yml` steps are `actions/checkout@v4`, `pnpm/action-setup@v4` with `version: 10.6.5`, `actions/setup-node@v4` with `node-version: 22`, then `pnpm install --frozen-lockfile`. There is no apt, brew, or choco step. Root `packageManager` is `pnpm@10.6.5`.

`pnpm-workspace.yaml` `onlyBuiltDependencies` lists those five packages (plus `core-js` and `core-js-pure`, which the design treats as allowlisted and not native). `@specd/code-graph` depends on the three `@ast-grep/lang-*` packages and `better-sqlite3`. `esbuild` is in `pnpm-lock.yaml` as a transitive dependency, so the frozen install is what builds it. Extra allowlist entries are not forbidden.

### 7. `default:_global/continuous-integration` — Checks

Each job must run `pnpm typecheck`, `pnpm build`, and `pnpm test`, in that order. `typecheck` and `build` must skip `@specd/public-web`. `pnpm test` must run Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and each `@specd/plugin-agent-*` package. It must not include `@specd/mcp` or `@specd/public-web`. The workflow must not run changeset status or publish.

**Status: met.**

`ci.yml` runs those three commands in that order and nothing after them. Root scripts:

- `typecheck`: `turbo typecheck --filter=!@specd/public-web`
- `build`: `turbo build --filter=!@specd/public-web`
- `test`: `turbo test --concurrency=3` with filters for exactly the twelve packages named above

Each of those twelve packages has `"test": "vitest run"`. `@specd/mcp` has a Vitest script but is not in the filter. `@specd/public-web` is not in the filter. No changeset or publish step is in the workflow.

### 8. `default:_global/docs` — Non-Windows hook spawn in the workflow guide

The modified user-guide requirement says developer `run:` values are inserted verbatim, SpecD translates only quote syntax the host shell does not understand, and the guide must say that non-Windows hooks run with the absolute `SHELL` value when it is absolute, otherwise `/bin/sh`. It must not describe that substitution as shell escaping.

**Status: met.**

`docs/guide/workflow.md` says substitution inserts `{{...}}` exactly, `instruction:` is verbatim and is not a shell command, and:

> A `run:` command is a shell command. macOS and Linux run it with the absolute `$SHELL` or `/bin/sh`. Windows runs it with `cmd.exe`.

The quote section is titled as quote translation, not shell escaping. The only other "escape" in that file is the lifecycle phrase "manual escape to revise specs", which is unrelated.

`NodeHookRunner.spawnHook` matches that rule: on `win32` it spawns `cmd.exe` with `['/d', '/s', '/c', command]`; otherwise it uses `process.env['SHELL']` when that value is absolute, and `/bin/sh` when `SHELL` is missing or relative, with `['-c', command]`.

### 9. `core:workspace` — Windows device names are reserved workspace names

`con`, `prn`, `aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9` must be rejected on every operating system when the whole workspace name is the device name. `con-foo` must stay legal. `default` and `root` stay reserved.

**Status: met.**

`FsConfigLoader._buildConfig` calls `isWindowsDeviceName(name)` and throws `ConfigValidationError` (`'...' is a Windows device name`) before the workspace is built. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`, so the whole segment is compared case-insensitively and `con-foo` does not match. Workspace keys are a Zod `z.record`, so `con` reaches this check rather than being dropped earlier. `workspaces.root` is still rejected as reserved for project-global graph identities, and `workspaces.default` is still required.

`config-loader.spec.ts` rejects workspace `con` with `/Windows device name/` and accepts `con-foo`. `isWindowsDeviceName('NUL')` is true in `windows-device-name.spec.ts`, which covers the scenario's `nul` example case-insensitively. An existing test rejects workspace `root`.

### 10. `core:spec-id-format` — Capability segments reject Windows device names

A capability-path segment that is a Windows device name must be rejected on every operating system. The same reserved set is compared case-insensitively as the whole segment. `con-foo` must remain legal. This rule does not treat a Windows drive letter as a workspace name; spec IDs are not filesystem paths.

**Status: met.**

`SpecPath._validateSegments` rejects a segment when `isWindowsDeviceName(segment)` is true, with `InvalidSpecPathError`. `SpecPath.parse` splits on `/` only. `parseSpecId` still splits on the first `:` and does not interpret a drive letter as a workspace. The device-name rule is not implemented by treating spec IDs as Windows paths.

`spec-path.spec.ts` throws on `con` and on `auth/com1`, and accepts `con-foo`. Case-insensitivity is covered by `isWindowsDeviceName('NUL')` on the same helper `SpecPath` calls.

## Discrepancies

None.

## Missing tests

### Counted

1. **`prn` and `aux` are never asserted.** The reserved set in both the workspace requirement and the spec-id requirement includes `prn` and `aux`. `windows-device-name.spec.ts` asserts `con`, `NUL`, `com1`, `lpt9`, and `con-foo` only. No `*.spec.ts` under `packages/` contains `prn`, `aux`, or `lpt1`. `lpt9` exercises `lpt[1-9]`, and `com1` exercises `com[1-9]`. `prn` and `aux` are separate alternatives, so deleting them from the regex would not fail the current tests. The loader, `SpecPath`, and change-name checks all call this helper, so one helper assertion would cover those call sites.

### Coverage notes (not counted)

Workflow files have no Vitest. File inspection is the test, and the files match the spec, so this is not a discrepancy and is not a missing test:

- `.github/workflows/ci.yml` matches the trigger, matrix, toolchain, and check requirements.
- `.gitignore` matches the tracking requirement (`git check-ignore` as above).
- `.gitattributes` is present (`* text=auto eol=lf`, plus `*.md`, `*.yaml`, `*.yml`, `*.json` forced to LF). None of these five specs require it. It is not a discrepancy.
- The docs verify scenario is a review of `docs/guide/workflow.md`. The hook sentence matches the code.
- The fixture and chmod rules are properties of the suite. Inspection found `os.tmpdir()` fixtures, `pathToFileURL` for real module URLs, an `EACCES` mock instead of `chmod 0o000`, and no created `/tmp` fixture. Mock `/tmp` strings are non-goals.

## Summary

counts: requirements 10, discrepancies 0, missing tests 1
