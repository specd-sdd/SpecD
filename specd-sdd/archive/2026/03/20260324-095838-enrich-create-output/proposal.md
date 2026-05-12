# Proposal: enrich-create-output

## Motivation

When an AI agent creates a change via `change create`, the JSON response only contains `{ result, name, state }`. The agent doesn't know the filesystem path where it should write artifacts (proposal.md, design.md, deltas/, etc.). It has to make a separate `change status` call to get `lifecycle.changePath`. This extra step is easy to forget, leading agents to guess paths incorrectly.

## Current behaviour

```json
{ "result": "ok", "name": "my-change", "state": "drafting" }
```

The `changePath` is only available from `change status`.

## Proposed solution

Add `changePath` to the `CreateChange` use case result and to the CLI JSON output:

```json
{
  "result": "ok",
  "name": "my-change",
  "state": "drafting",
  "changePath": "/abs/path/.specd/changes/..."
}
```

This is a non-breaking addition — the text output remains unchanged, and the JSON output gains one field.

## Specs affected

### Modified specs

- `core:core/create-change`: add `changePath` to the return value (the `Change` entity already knows its path via the repository)
- `cli:cli/change-create`: add `changePath` to the JSON output

## Impact

| Layer                     | Change                                            |
| ------------------------- | ------------------------------------------------- |
| **Core** (`CreateChange`) | Return `changePath` alongside the `Change` entity |
| **CLI** (`change create`) | Include `changePath` in JSON/toon output          |

## Open questions

None.
