# Tasks: cli-init-alias

## 1. CLI registration

- [x] 1.1 Register `init` as a top-level command on the root program
      `packages/cli/src/index.ts`: after line 175 (`registerProjectDashboard(projectCmd)`) — add `registerProjectInit(program)` so `specd init` delegates to the same handler as `specd project init`
      Approach: add a single line `registerProjectInit(program)` after the project command group registration block. The function already parameterises the parent command, so no changes to `registerProjectInit` itself are needed.
      (Req: Top-level init alias, Command signature)

## 2. Tests

- [x] 2.1 Add tests for `specd init` alias behavior
      `packages/cli/test/commands/project-init.spec.ts`: new test cases — verify `specd init` produces identical behavior to `specd project init`
      Approach: add a describe block for the top-level `init` alias. Test cases: (1) `specd init --workspace default` exits 0 and writes `specd.yaml`; (2) `specd init --format json` produces valid JSON with expected keys; (3) `specd init` with existing config and no `--force` exits 1; (4) `specd init --force` overwrites.
      (Req: Command signature, Top-level init alias, scenario: specd init alias works identically)

- [x] 2.2 Add test for `specd init` in root help output
      `packages/cli/test/entrypoint.spec.ts`: new test case — verify `specd --help` includes `init` as a top-level command
      Approach: parse the help output from the root program and assert that `init` appears in the commands section.
      (Req: Top-level init alias, scenario: specd init appears in root help output)

- [x] 2.3 Add test for `specd init` rejecting excess arguments
      `packages/cli/test/commands/project-init.spec.ts`: new test case — verify `specd init extra-arg` exits 1 with usage error
      Approach: invoke the CLI with `['init', 'extra-arg']` and assert exit code 1 and stderr contains a usage error. `registerProjectInit` already sets `.allowExcessArguments(false)`.
      (Req: Excess arguments rejected, scenario: specd init rejects excess arguments)

## 3. Manual verification

- [x] 3.1 Run manual E2E verification steps
      Approach: (1) `specd --help` — confirm `init` appears; (2) `specd init --workspace default` in a clean dir — confirm writes `specd.yaml`; (3) `specd init --format json` — confirm JSON output matches `specd project init --format json`; (4) `specd init extra-arg` — confirm exits 1; (5) `specd project init --workspace default` — confirm existing behavior unchanged.
      (Req: Top-level init alias, all scenarios)
