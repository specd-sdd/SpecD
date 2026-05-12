# Proposal: batch-change-validate

## Motivation

Validating a change with many specs requires invoking `change validate <name> <specId>` once per spec. A change with 14 specs means 14 commands. There is no way to validate all specs in a single invocation.

## Current behaviour

`specd change validate <name> <specPath>` validates one spec at a time. Both `<name>` and `<specPath>` are required positional arguments. To validate all specs, users must iterate:

```bash
for spec in $(specd change status my-change --format json | jq -r '.specIds[]'); do
  specd change validate my-change "$spec"
done
```

## Proposed solution

Add `--all` flag to `change validate`. When set, `<specPath>` becomes optional and the command iterates over all `specIds` from the change, validating each one. `--artifact` continues to work with `--all` (validates only that artifact across every spec).

## Specs affected

### Modified specs

- `cli:cli/change-validate`: add `--all` flag and batch output

## Impact

| Layer                       | Change                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| **CLI** (`change validate`) | Add `--all` flag; iterate over change's `specIds`; batch output with summary |
| **Core**                    | No changes — existing `ValidateArtifacts` use case is called per spec        |

## Open questions

None.
