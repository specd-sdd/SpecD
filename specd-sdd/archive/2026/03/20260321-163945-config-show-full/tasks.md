# Tasks: config-show-full

## 1. CLI command update

- [x] 1.1 Update JSON serialization to include all SpecdConfig fields
      `packages/cli/src/commands/config/show.ts`:
      JSON output block — replace partial object with full config serialization
      Approach: build `Record<string, unknown>` with required fields, conditionally
      spread optional fields; include full workspace entries with schemasPath/codeRoot/prefix
      (Req: Output format)

- [x] 1.2 Update text serialization to include optional fields
      `packages/cli/src/commands/config/show.ts`:
      text output block — add sections for context, contextIncludeSpecs, contextExcludeSpecs,
      llmOptimizedContext, schemaPlugins, workflow, artifactRules, schemaOverrides
      Approach: after storage section, append lines for each optional field when present
      (Req: Output format)

## 2. Tests

- [x] 2.1 Update existing test mocks and add new test scenarios
      `packages/cli/test/commands/config-show.spec.ts`:
      update mock config to include optional fields; add tests for full JSON output,
      optional field omission, workspace field coverage, text mode optional sections
      (Req: Output format)

## 3. Verification

- [x] 3.1 Build and run full test suite
      `pnpm build && pnpm test`

- [x] 3.2 E2E: verify config show output
      Manual: run `specd config show` and `specd config show --format json`,
      verify all config fields appear
