# Proposal: config-show-full

## Motivation

`specd config show --format json` only outputs 5 of 13 `SpecdConfig` fields. Optional fields like `workflow`, `schemaOverrides`, `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, `llmOptimizedContext`, `schemaPlugins`, and `artifactRules` are silently dropped. This makes `config show` useless for debugging config issues related to these fields — which is its primary purpose.

## Current behaviour

The JSON output manually constructs a partial object with only `projectRoot`, `schemaRef`, `workspaces` (partial), `storage` (partial), and `approvals`. The text output similarly only shows these 5 sections. Optional fields are never serialized even when present.

Additionally, `workspaces` entries omit `schemasPath`, `codeRoot`, `prefix`, and workspace-level `contextIncludeSpecs`/`contextExcludeSpecs`. `storage` omits `archivePattern`.

## Proposed solution

Serialize the full `SpecdConfig` object in both JSON and text modes. For JSON mode, output all fields present in the config (omitting `undefined` optionals). For text mode, add sections for the optional fields when they are set.

## Specs affected

### New specs

_(none)_

### Modified specs

- `cli:cli/config-show`: update output format requirement and examples to include all `SpecdConfig` fields; update verify scenarios for full coverage

## Impact

- **`@specd/cli` — `config show` command**: updated serialization for both text and JSON output
- **Tests**: updated CLI test assertions
- **No core changes**: `SpecdConfig` is already complete — this is a pure CLI serialization fix

## Open questions

_(none)_
