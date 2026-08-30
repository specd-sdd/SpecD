# Tasks: cli-specs-list-count

## 1. CLI Option Registration & Validation

- [x] 1.1 Register `--count` flag and update help text
      `packages/cli/src/commands/spec/list.ts`: `registerSpecList` — add `--count` option and help text schema
      Approach: use `.option('--count', 'show total specs and per-workspace counts')` on `cmd` and document JSON/TOON output schema in `addHelpText`
      (Req: Command signature)
- [x] 1.2 Validate mutual exclusivity between `--count` and `--summary`
      `packages/cli/src/commands/spec/list.ts`: `registerSpecList` action handler — throw validation error if both flags are passed
      Approach: check `if (opts.count === true && opts.summary === true) throw new CliValidationError('--count is mutually exclusive with --summary')`
      (Req: Command signature)

## 2. Count Output Handling

- [x] 2.1 Compute total and per-workspace counts from query result
      `packages/cli/src/commands/spec/list.ts`: `registerSpecList` action handler — extract totals across visible workspaces
      Approach: when `opts.count === true`, compute `total` by summing `workspaceMeta.get(name)?.total` across `visibleWorkspaces`
      (Req: Output format)
- [x] 2.2 Implement `--count` text, json, and toon formatting
      `packages/cli/src/commands/spec/list.ts`: `registerSpecList` action handler — format output according to selected format
      Approach: render `<ws>: <count>` for single filtered workspace, `Total: <total>\n\nWorkspaces:\n  <ws>: <count>` for multi-workspace in text, and `{ total, workspaces: [...] }` for json/toon
      (Req: Output format)

## 3. Unit Tests

- [x] 3.1 Add unit tests for `--count` in text, JSON, and TOON formats
      `packages/cli/test/commands/spec-list.spec.ts`: `describe('spec list --count')` — test all count formats and filters
      Approach: add test cases for single workspace text, multi-workspace text, `--workspace` filtered text, structured JSON, filtered JSON, and TOON
      (Req: Output format)
- [x] 3.2 Add test for `--count` and `--summary` mutual exclusivity
      `packages/cli/test/commands/spec-list.spec.ts`: `describe('spec list --count')` — test error rejection
      Approach: invoke command with `--count` and `--summary`, assert process exits with code 1 and stderr matches validation message
      (Req: Command signature)
