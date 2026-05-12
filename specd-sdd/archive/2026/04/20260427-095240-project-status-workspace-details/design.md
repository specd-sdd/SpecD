# Design: project-status-workspace-details

## Problem

The `project status` command provides an incomplete view of workspaces. In text format, it misses `codeRoot` and `isExternal` status. In JSON/Toon formats, it includes `codeRoot` but misses `isExternal`. This makes it difficult for users and agents to understand the project structure and context locality (whether specs/code are inside or outside the repository root).

## Current Behaviour

In `packages/cli/src/commands/project/status.ts`, the `registerProjectStatus` action fetches the configuration and maps workspaces to a reduced set of fields:

```typescript
// For JSON/TOON
const workspaceData = config.workspaces.map((w) => ({
  name: w.name,
  prefix: w.prefix ?? null,
  ownership: w.ownership,
  codeRoot: w.codeRoot,
}))

// For TEXT
const lines = [
  // ...
  `workspaces:`,
  ...config.workspaces.map((w) => `  ${w.name} (prefix: ${w.prefix ?? '-'}) [${w.ownership}]`),
  // ...
]
```

`isExternal` is entirely missing from both. `codeRoot` is missing from the text output.

## Proposed Solution

Enhance both output formats to include all relevant workspace locality and ownership information.

### Approach

1.  **Update Structured Output (JSON/TOON)**: Include `isExternal` in the mapped `workspaceData` array.
2.  **Update Text Output**: Enrich the workspace line to include both `isExternal` status and `codeRoot`.

## Affected Areas

- `packages/cli/src/commands/project/status.ts` — The action handler for the `project status` command.

## New Constructs

No new constructs are required as the necessary fields already exist in `SpecdWorkspaceConfig` within `@specd/core`.

## Implementation Details

### CLI Command Update

In `packages/cli/src/commands/project/status.ts`:

**Structured Output:**
Update the mapping to include `isExternal`.

```typescript
const workspaceData = config.workspaces.map((w) => ({
  name: w.name,
  prefix: w.prefix ?? null,
  ownership: w.ownership,
  codeRoot: w.codeRoot,
  isExternal: w.isExternal, // Added
}))
```

**Text Output:**
Update the line template for workspaces. We will use a more descriptive format:
`  <name> (prefix: <prefix>) [<ownership>, <external-status>, codeRoot: <path>]`

Where `<external-status>` is "external" if `isExternal` is true, or "local" if false.

```typescript
...config.workspaces.map(
  (w) => `  ${w.name} (prefix: ${w.prefix ?? '-'}) [${w.ownership}, ${w.isExternal ? 'external' : 'local'}, codeRoot: ${w.codeRoot}]`,
),
```

## Testing

1.  **Unit Tests**: Update existing tests for `project status` in `packages/cli/test/commands/project/status.spec.ts` (if they exist) or add a new test file to verify the new fields are present in all formats.
2.  **Manual Verification**:
    - Run `pnpm specd project status` and verify text output.
    - Run `pnpm specd project status --format json` and verify `isExternal` is present.
    - Run `pnpm specd project status --format toon` and verify consistency.

## Open Questions

_none_
