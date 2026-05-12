# Proposal: project-status-workspace-details

## Motivation

The `project status` command provides a high-level overview of the project, but it lacks critical details about workspace locality and implementation roots. Users and agents need to know whether a workspace is external to the repository and exactly where its code is located to navigate the project effectively and understand the scope of their work.

## Current behaviour

Currently, `project status` in text format only shows the workspace name, prefix, and ownership. In JSON/Toon formats, it includes `codeRoot` but lacks `isExternal`. This inconsistency and lack of detail in the primary human-readable format makes it harder to identify external dependencies and implementation paths at a glance.

## Proposed solution

Enhance the `project status` command to include `isExternal` and `codeRoot` for every workspace in all output formats.

- In **text format**, workspaces will display their ownership, external status, and code root path.
- In **JSON and TOON formats**, each workspace object will include the `isExternal` boolean (joining the existing `codeRoot` field).

## Specs affected

### New specs

_none_

### Modified specs

- `cli:cli/project-status`: Update the "includes workspace information" requirement to explicitly mandate `isExternal` and `codeRoot` fields. Update verification scenarios to cover these new fields.
  - Depends on (added): none

## Impact

- **CLI**: `packages/cli/src/commands/project/status.ts` will be updated to fetch and display these fields from the configuration.
- **UX**: Improved visibility of project structure for both human users and AI agents.

## Technical context

- `SpecdWorkspaceConfig` already contains `codeRoot: string` and `isExternal: boolean`, so no domain-level changes are required in `packages/core`.
- The `isExternal` field is inferred by the `FsConfigLoader` during project initialization based on whether the workspace root is within the git repository.

## Open questions

_none_
