# Tasks: improve-change-dependency-visibility

## 1. Core Use Case: GetStatus

- [x] 1.1 Add `specDependsOn` to `GetStatusResult` interface
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatusResult` — add `specDependsOn: Record<string, string[]>`
      Approach: update interface to include the serialized record format for spec dependencies.
      (Req: Returns the change and its artifact statuses)

- [x] 1.2 Project `specDependsOn` in `GetStatus.execute()`
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus.execute()` — convert `change.specDependsOn` Map to Record
      Approach: in the success result mapping, iterate over the Map and create a plain object Record.
      (Req: Returns the change and its artifact statuses)

## 2. CLI Command: change status

- [x] 2.1 Update text mode: remove redundant `specs:` and add `specs and dependencies`
      `packages/cli/src/commands/change/status.ts`: `ChangeStatus` command — remove redundant spec list and add new section
      Approach: remove the line rendering `specs: ...` at the top; rename "spec dependencies" section to "specs and dependencies".
      (Req: Specs and dependencies section, Scenario: Text output shows specs and dependencies section)

- [x] 2.2 Update Toon and JSON output projection
      `packages/cli/src/commands/change/status.ts`: `ChangeStatus` command — ensure `specDependsOn` is projected
      Approach: check the `Toon` and `JSON` formatters in the command; ensure the new field from the use case result is passed through to the output object.
      (Req: Specs and dependencies section, Scenario: JSON output includes specDependsOn)

## 3. CLI Command: change deps

- [x] 3.1 Make `specId` optional and update command signature
      `packages/cli/src/commands/change/deps.ts`: `ChangeDeps` command signature — change `specId` argument to optional
      Approach: update the command definition to allow zero-argument (spec-wise) calls.
      (Req: Command signature)

- [x] 3.2 Implement listing mode for all specs
      `packages/cli/src/commands/change/deps.ts`: `ChangeDeps` command logic — handle missing `specId`
      Approach: if `specId` is missing and no modification flags are present, load the change via `GetStatus` and render the complete list of specs and their dependencies.
      (Req: Output, Scenario: List all dependencies in the change)

- [x] 3.3 Implement display mode for single spec
      `packages/cli/src/commands/change/deps.ts`: `ChangeDeps` command logic — handle `specId` without flags
      Approach: if `specId` is present but no modification flags are present, display only the dependencies for that spec.
      (Req: Output, Scenario: Display dependencies for a specific spec)

- [x] 3.4 Validate modification flags require specId
      `packages/cli/src/commands/change/deps.ts`: `ChangeDeps` command logic — add error check
      Approach: if modification flags (`--add`, `--remove`, `--set`) are provided but `specId` is missing, throw an error with code 1.
      (Req: Error cases, Scenario: Error when modification flags provided without specId)

## 4. Tests

- [x] 4.1 Update `GetStatus` unit tests
      `packages/core/test/application/use-cases/get-status.spec.ts`: add test for `specDependsOn` projection
      Approach: create a change with declared deps and verify the use case result contains them in the Record format.

- [x] 4.2 Update `change status` integration tests
      `packages/cli/test/commands/change/status.spec.ts`: add tests for refined dependency section visibility
      Approach: run command against a change with deps and assert on text/JSON output content. Verify redundant `specs:` line is gone.

- [x] 4.3 Add `change deps` integration tests
      `packages/cli/test/commands/change/deps.spec.ts`: add tests for listing and display modes
      Approach: verify list all (zero args), display one (one arg, no flags), and error on flags without specId.

## 5. Documentation & Verification

- [x] 5.1 Perform manual E2E verification
      E2E: verify commands in a real environment using the manual steps defined in `design.md`.
      Approach: follow the \"Manual / E2E verification\" section in design.md.
