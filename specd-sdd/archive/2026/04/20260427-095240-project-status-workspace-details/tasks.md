# Tasks: project-status-workspace-details

## 1. CLI Implementation

- [x] 1.1 Update workspace mapping for structured output
      `packages/cli/src/commands/project/status.ts`: `workspaceData` mapping — add `isExternal: w.isExternal`
      Approach: update the `.map()` function inside the `if (fmt !== 'text')` block to include the `isExternal` boolean field.
      (Req: includes workspace information, Scenario: JSON output is valid)

- [x] 1.2 Update workspace line rendering for text output
      `packages/cli/src/commands/project/status.ts`: `lines` array — update workspace mapping
      Approach: update the template literal to include `${w.isExternal ? 'external' : 'local'}` and `codeRoot: ${w.codeRoot}`.
      (Req: includes workspace information, Scenario: Output includes all workspace details)

## 2. Verification

- [x] 2.1 Verify text output
      Manual verification: run `pnpm specd project status`
      Approach: confirm that each workspace line contains the ownership, locality (local/external), and the code root path.
      (Req: includes workspace information, Scenario: Output includes all workspace details)

- [x] 2.2 Verify JSON output
      Manual verification: run `pnpm specd project status --format json`
      Approach: confirm that each object in the `workspaces` array contains `isExternal` (boolean) and `codeRoot` (string).
      (Req: supports json and toon formats, Scenario: JSON output is valid)
