# Design: batch-generate-metadata

## Non-goals

- **Core use case changes** — `GenerateSpecMetadata`, `SaveSpecMetadata`, and `ListSpecs` already support everything needed
- **Parallel execution** — specs are processed sequentially; parallelism can be added later if needed

## Affected areas

### CLI helper: `parse-comma-values`

**File:** `packages/cli/src/helpers/parse-comma-values.ts`

New shared helper extracted from the existing `parseMetadataStatusFilter` in `spec/list.ts`. Parses a comma-separated string and validates each token against a set of allowed values.

### CLI: `spec list`

**File:** `packages/cli/src/commands/spec/list.ts`

Refactor to use the new shared `parseCommaSeparatedValues` helper instead of the inline `parseMetadataStatusFilter` function.

### CLI: `spec generate-metadata`

**File:** `packages/cli/src/commands/spec/generate-metadata.ts`

Add `--all` and `--status` flags, batch processing loop, and output formatting. Uses the same shared helper for `--status` parsing.

## New constructs

### `parseCommaSeparatedValues<T>()`

- **Location:** `packages/cli/src/helpers/parse-comma-values.ts`
- **Shape:**
  ```typescript
  function parseCommaSeparatedValues<T extends string>(
    value: string,
    validValues: ReadonlySet<T>,
    optionName: string,
  ): Set<T>
  ```
- **Responsibility:** Splits a comma-separated string, trims and lowercases each token, validates against `validValues`, throws a descriptive error if any token is invalid. Returns the validated set.
- **Relationships:** Called by `spec list` (replacing inline `parseMetadataStatusFilter`) and `spec generate-metadata` (new `--status` flag).

## Approach

### 1. Extract shared helper

Create `packages/cli/src/helpers/parse-comma-values.ts` with `parseCommaSeparatedValues`. Refactor `spec/list.ts` to use it, removing the inline `parseMetadataStatusFilter`. This is a mechanical extraction — no behaviour change.

### 2. Make `<specPath>` optional

Change from `.command('generate-metadata <specPath>')` to `.command('generate-metadata [specPath]')`.

### 3. Add new options

```typescript
.option('--all', 'generate metadata for all specs matching --status filter')
.option('--status <values>', 'comma-separated status filter for --all (default: stale,missing)')
```

### 4. Validate flag combinations at the CLI boundary

Before any processing:

- `--all` without `--write` → `cliError('--all requires --write')`
- `--all` with `specPath` → `cliError('--all and <specPath> are mutually exclusive')`
- `--status` without `--all` → `cliError('--status requires --all')`
- `--status` values validated via `parseCommaSeparatedValues` against allowed set (`stale`, `missing`, `invalid`, `fresh`, `all`)

### 5. Batch path

When `--all` is set:

1. Call `kernel.specs.list.execute({ includeMetadataStatus: true })`
2. Parse `--status` (default `stale,missing`) via `parseCommaSeparatedValues`
3. If status set contains `all`, skip filtering; otherwise filter entries by `metadataStatus`
4. Check `hasExtraction` once via `kernel.specs.generateMetadata.execute()` on the first spec — if `false`, abort
5. For each matching spec, call `generateMetadata` + `saveMetadata` in a try/catch
6. Collect results (success/failure per spec)
7. Output summary

### 6. Output format

**Text:**

```
wrote metadata for core:core/config
wrote metadata for core:core/change
error: core:core/delta-format: dependsOn would change (...)
generated metadata for 2/3 specs
```

**JSON:**

```json
{ "result": "ok", "total": 2, "succeeded": 2, "failed": 0, "specs": [...] }
```

`result` is `"ok"` when all succeed, `"partial"` when some fail, `"error"` when all fail.

## Key decisions

**Decision: shared helper, not inline** → The comma-separated parsing + validation pattern already exists in `spec list` and is now needed in `spec generate-metadata`. Extracting to a helper avoids duplication and ensures consistent error messages. The helper is generic (`<T extends string>`) so it works for any set of valid values.

**Decision: no new core use case** → The batch logic is pure CLI orchestration — iterate, call existing use cases, collect results. No domain logic involved. Adding a core use case would be over-engineering for a loop.

**Decision: sequential processing** → Specs are processed one at a time. The number of specs is small enough that parallelism adds complexity without meaningful benefit.

**Decision: continue on individual failure** → A single `DependsOnOverwriteError` should not abort the entire batch. The user sees which specs failed and can re-run with `--force` or fix individually.

## Testing

### New test files

- `packages/cli/test/helpers/parse-comma-values.spec.ts` — unit tests for the shared helper

### Modified test files

- `packages/cli/test/commands/spec-generate-metadata.spec.ts` — add tests for `--all`, `--status`, flag validation, batch output

### Scenarios to cover

- `parseCommaSeparatedValues` — valid values, invalid values, mixed, trimming, case normalization
- `--all` without `--write` → error
- `--all` with `specPath` → error
- `--status` without `--all` → error
- Invalid `--status` value → error
- `--all --write` with default filter → processes stale+missing only
- `--all --write --status all` → processes every spec
- Individual failure continues batch, exit code 1
- `--all --write --force` skips conflict detection
- JSON output format with batch results
