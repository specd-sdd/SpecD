# Design: batch-change-validate

## Non-goals

- **Core use case changes** — `ValidateArtifacts` already does the work per spec
- **Filtering by artifact status** — `--all` validates every specId without filtering

## Affected areas

### CLI: `change validate`

**File:** `packages/cli/src/commands/change/validate.ts`

The only file that changes.

## Approach

### 1. Make `<specPath>` optional

Change from `.command('validate <name> <specPath>')` to `.command('validate <name> [specPath]')`.

### 2. Add `--all` option

```typescript
.option('--all', 'validate all specIds in the change')
```

### 3. Validate flag combinations

- `--all` with `specPath` → `cliError('--all and <specPath> are mutually exclusive')`
- Neither `--all` nor `specPath` → `cliError('either <specPath> or --all is required')`

### 4. Batch path

When `--all` is set:

1. Load change status via `kernel.changes.getStatus.execute({ name })` to get `specIds`
2. For each specId, call `kernel.changes.validate.execute({ name, specPath, artifactId? })`
3. Collect results per spec
4. Output each spec's result followed by summary

### 5. Output format

**Text:**

```
validated my-change/default:auth/login: all artifacts pass
validation failed my-change/default:auth/logout:
  error: specs — missing spec.md.delta.yaml
validated 1/2 specs
```

**JSON:**

```json
{ "passed": false, "total": 2, "results": [{ "spec": "...", "passed": true, ... }, ...] }
```

## Key decisions

**Decision: use GetStatus to get specIds** → The change's `specIds` are available from `getStatus`. No need for a separate call.

**Decision: no new core use case** → Same as batch-generate-metadata — pure CLI orchestration.

## Testing

### Modified test files

- `packages/cli/test/commands/change-validate.spec.ts` — add batch mode tests
