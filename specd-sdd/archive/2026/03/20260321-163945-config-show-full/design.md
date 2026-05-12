# Design: config-show-full

## Affected areas

### `packages/cli/src/commands/config/show.ts`

The only file that needs changes. Both the text and JSON serialization blocks need to include all `SpecdConfig` fields.

**JSON mode (lines 40-58):** Currently constructs a partial object manually. Replace with full serialization of all config fields. Optional fields are spread conditionally.

**Text mode (lines 23-37):** Currently shows 5 sections. Add sections for optional fields when present: `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, `llmOptimizedContext`, `schemaPlugins`, `workflow`, `artifactRules`, `schemaOverrides`.

### `packages/cli/test/commands/config-show.spec.ts`

Update test mocks and assertions to include the new fields.

## Approach

### JSON mode

Replace the manual object construction with a serialization that includes every field:

```typescript
const obj: Record<string, unknown> = {
  projectRoot: config.projectRoot,
  schemaRef: config.schemaRef,
  workspaces: config.workspaces.map((ws) => {
    const entry: Record<string, unknown> = {
      name: ws.name,
      specsPath: ws.specsPath,
      ownership: ws.ownership,
      isExternal: ws.isExternal,
    }
    if (ws.schemasPath !== null) entry.schemasPath = ws.schemasPath
    if (ws.codeRoot !== ws.specsPath) entry.codeRoot = ws.codeRoot
    if (ws.prefix !== undefined) entry.prefix = ws.prefix
    if (ws.contextIncludeSpecs !== undefined) entry.contextIncludeSpecs = ws.contextIncludeSpecs
    if (ws.contextExcludeSpecs !== undefined) entry.contextExcludeSpecs = ws.contextExcludeSpecs
    return entry
  }),
  storage: {
    changesPath: config.storage.changesPath,
    draftsPath: config.storage.draftsPath,
    discardedPath: config.storage.discardedPath,
    archivePath: config.storage.archivePath,
    ...(config.storage.archivePattern !== undefined
      ? { archivePattern: config.storage.archivePattern }
      : {}),
  },
  approvals: config.approvals,
}
// Optional top-level fields
if (config.workflow !== undefined) obj.workflow = config.workflow
if (config.artifactRules !== undefined) obj.artifactRules = config.artifactRules
if (config.context !== undefined) obj.context = config.context
if (config.contextIncludeSpecs !== undefined) obj.contextIncludeSpecs = config.contextIncludeSpecs
if (config.contextExcludeSpecs !== undefined) obj.contextExcludeSpecs = config.contextExcludeSpecs
if (config.llmOptimizedContext !== undefined) obj.llmOptimizedContext = config.llmOptimizedContext
if (config.schemaPlugins !== undefined) obj.schemaPlugins = config.schemaPlugins
if (config.schemaOverrides !== undefined) obj.schemaOverrides = config.schemaOverrides
output(obj, fmt)
```

### Text mode

After the existing storage section, add lines for optional fields:

```typescript
if (config.context !== undefined && config.context.length > 0) {
  lines.push('', 'context:')
  for (const entry of config.context) {
    if ('file' in entry) lines.push(`  file: ${entry.file}`)
    else lines.push(`  instruction: ${entry.instruction}`)
  }
}
if (config.contextIncludeSpecs !== undefined)
  lines.push(`contextIncludeSpecs: ${config.contextIncludeSpecs.join(', ')}`)
// ... etc for each optional field
```

## Key decisions

**Decision: Conditionally include optional fields** → Only include when `!== undefined`. This keeps JSON output clean — consumers don't see `null` or empty arrays for unset fields. Matches the existing pattern in `change status`.

**Decision: `schemaOverrides` shows `(present)` in text mode** → The structure is deeply nested (operations with workflow/artifact entries). Dumping it in text mode would be unreadable. JSON mode shows the full structure.

## Testing

### Automated tests

#### `packages/cli/test/commands/config-show.spec.ts`

- Update "JSON output is full SpecdConfig" test — mock config with optional fields, verify they appear in output
- Add "Optional fields omitted when not set" — mock config without optionals, verify JSON doesn't have them
- Update "Text output shows all sections" — verify new sections appear
- Add "Workspace entries include all fields" — verify `schemasPath`, `codeRoot`, `prefix`

### Manual / E2E verification

```bash
specd config show --format json
# Expected: all fields including workflow, contextIncludeSpecs, etc.
specd config show
# Expected: text output with optional sections
```

## Open questions

_(none)_
