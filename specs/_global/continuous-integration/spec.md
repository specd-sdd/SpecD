# Continuous Integration

## Purpose

A green local run on one operating system does not show that path handling, native modules, and the test suite still work on the others. This spec defines the GitHub Actions workflow that runs the same checks on macOS, Linux, and Windows.

## Requirements

### Requirement: Workflow file is tracked

The repository MUST track `.github/workflows/ci.yml`. Tracking that directory MUST NOT require tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` MUST stay ignored.

### Requirement: Three operating systems

`ci.yml` MUST run the same job on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any one of those runners MUST fail the check.

### Requirement: When the workflow runs

The workflow MUST run on pull requests and on pushes to `main`. It MUST NOT call the Gemini workflows.

### Requirement: Toolchain install

Each job MUST check out the repository, install the pnpm `10.6.5` binary, install Node 22, and run `pnpm install --frozen-lockfile`.

That install MUST be what builds the native modules the repo still depends on: `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. The workflow MUST NOT install extra apt, brew, or Chocolatey packages for them.

### Requirement: Checks

Each job MUST run `pnpm build`, `pnpm typecheck`, and `pnpm test`, in that order.

`typecheck` and `build` MUST skip `@specd/public-web`.

`pnpm test` MUST run Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, `@specd/plugin-agent-claude`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`, and `@specd/plugin-agent-standard`.

`pnpm test` MUST NOT include `@specd/mcp` or `@specd/public-web`.

The workflow MUST NOT run changeset status or publish.

## Constraints

- The workflow is a GitHub Actions file. It does not add a new test runner.
- Gemini workflow files may be tracked because they share `.github/workflows/`. This spec does not define their behavior.

## Spec Dependencies

- [`default:_global/testing`](../testing/spec.md) — CI runs the Vitest suite those conventions describe
