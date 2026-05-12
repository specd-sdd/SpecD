# Tasks: context-modes-ux

## 1. Core Use Cases

- [x] 1.1 Update `CompileContext` default rendering logic
      `packages/core/src/application/use-cases/compile-context.ts`: `execute()` and `_renderFromMetadata()` — switch from raw markdown to structured metadata by default for `full` mode.
      Approach: In `execute()`, change the condition for calling `_renderSpecFiles`. Use `_renderFromMetadata()` even when `sections` is undefined if mode is `full`. Update `_renderFromMetadata()` to default to Description + Rules + Constraints when no filter is provided, and ensure Title/Description are always included.
      (Req: Output and rendering, Scenario: Default sections in full mode)

- [x] 1.2 Update `GetSpecContext` with default sections
      `packages/core/src/application/use-cases/get-spec-context.ts`: `_buildEntry()` — implement default sections and header persistence.
      Approach: Modify `_buildEntry` to always include `title` and `description` in `full` mode. If `sections` is empty/undefined and mode is `full`, default to `rules` and `constraints`.
      (Req: Build context entry from metadata, Scenario: Default sections in full mode)

- [x] 1.3 Update `GetProjectContext` structured rendering
      `packages/core/src/application/use-cases/get-project-context.ts`: `execute()` — switch to structured output and implement defaults.
      Approach: Similar to `CompileContext`, update the spec loop to prioritize metadata-based rendering for `full` mode and apply the Description + Rules + Constraints default.
      (Req: Returns GetProjectContextResult on success, Scenario: Default sections in full mode)

## 2. CLI Commands

- [x] 2.1 Add `--mode` flag and smart filtering to `project context`
      `packages/cli/src/commands/project/context.ts`: `command` definition and action handler — add flag and section logic.
      Approach: Add `.option('--mode <mode>')`. In the action handler, collect section flags into a `sections` array. Pass both to the kernel. Ensure output rendering uses the structured results for `full` mode.
      (Req: Command signature, Output and rendering)

- [x] 2.2 Add `--mode` flag and tiered filtering to `change context`
      `packages/cli/src/commands/change/context.ts`: `command` definition and action handler — add flag and preserve hybrid structure.
      Approach: Add `.option('--mode <mode>')`. Pass section flags to the kernel. Ensure the CLI output formatter correctly handles the structured `full` mode entries for change specs while keeping others in `summary`.
      (Req: Command signature, Scenario: Smart section filtering in hybrid mode)

- [x] 2.3 Update `spec context` to default to full mode
      `packages/cli/src/commands/spec/context.ts`: `action` handler — ignore config and force `full` mode.
      Approach: Explicitly pass `mode: 'full'` to the use case regardless of what `resolveCliContext` returns for project-level settings.
      (Req: Behaviour, Scenario: Full mode is the absolute default)

## 3. Testing

- [x] 3.1 Update Core use case tests
      `packages/core/test/application/use-cases/compile-context.test.ts`, `get-spec-context.test.ts`, `get-project-context.test.ts`
      Approach: Add test cases for the new Description + Rules + Constraints default in `full` mode and verify header persistence.

- [x] 3.2 Update CLI command tests
      `packages/cli/test/commands/project/context.test.ts`, `change/context.test.ts`, `spec/context.test.ts`
      Approach: Add test cases verifying the `--mode` flag overrides config and that section flags filter `full` mode output correctly.

- [x] 3.3 Manual E2E verification
      Approach: Run the commands listed in `design.md` in the development environment and verify the output structure and content.
