# Design: cli-specs-list-count

## Approach

The `--count` flag is implemented at the CLI adapter layer within `@specd/cli` in `packages/cli/src/commands/spec/list.ts`.

1. **Option Registration**: Register `.option('--count', 'show total specs and per-workspace counts')` on `registerSpecList(parent: Command)`.
2. **Mutual Exclusivity Validation**:
   - If both `opts.count` and `opts.summary` are set to `true`, throw a `CliValidationError('--count is mutually exclusive with --summary')`.
3. **Execution & Aggregation**:
   - Invoke `kernel.specs.list.execute` passing workspace filters when provided.
   - Extract `workspaceMeta` from `result.byWorkspace` to obtain per-workspace totals (`meta.total`).
   - Sum totals across `visibleWorkspaces` to compute the aggregate `total`.
4. **Output Rendering**:
   - **Text Mode**:
     - If filtered to a single workspace (`opts.workspace.length > 0 && visibleWorkspaces.length === 1`): `<workspace>: <count>`.
     - Otherwise (unfiltered or multi-workspace): `Total: <total>\n\nWorkspaces:\n  <ws1>: <count1>\n  <ws2>: <count2>`.
   - **JSON / TOON Mode**:
     - Serialize `{ total: number, workspaces: Array<{ name: string, count: number }> }`.

## Affected areas

| Package      | File                                           | Symbols / Modules               | Impact                                                        |
| ------------ | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `@specd/cli` | `packages/cli/src/commands/spec/list.ts`       | `registerSpecList`              | Adds `--count` flag, validation, and count output handling    |
| `@specd/cli` | `packages/cli/test/commands/spec-list.spec.ts` | `describe('spec list --count')` | Tests for count output in text/json/toon and validation rules |

## New / modified constructs

- `registerSpecList`:
  - Added `--count` option definition and help text documentation.
  - Added check: `if (opts.count === true && opts.summary === true) throw new CliValidationError(...)`.
  - Added conditional branch: `if (isCount) { ... return }`.

## Testing

- Unit tests in `packages/cli/test/commands/spec-list.spec.ts`:
  - `outputs total and per-workspace breakdown in text mode for single workspace`
  - `outputs total and per-workspace breakdown in text mode for multiple workspaces`
  - `outputs single workspace count when filtered via --workspace in text mode`
  - `outputs structured JSON with total and workspaces array`
  - `outputs filtered structured JSON when --workspace is specified`
  - `outputs TOON format when --format toon is specified`
  - `rejects using --count with --summary`

## Documentation

- Updated Commander command help text in `packages/cli/src/commands/spec/list.ts` documenting `--count` and its JSON/TOON output schema.

## Open questions

- None
