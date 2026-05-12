# Proposal: batch-generate-metadata

## Motivation

Regenerating metadata one spec at a time is tedious after bulk changes — renaming, archiving, or schema updates can leave dozens of specs with stale or missing metadata. There is no batch mode: users must manually iterate over `spec list --metadata-status` output and call `generate-metadata` for each one.

## Current behaviour

`specd spec generate-metadata <specPath>` operates on a single spec. To regenerate all stale metadata, users must script a loop:

```bash
for spec in $(specd spec list --metadata-status stale,missing --format json | ...); do
  specd spec generate-metadata "$spec" --write --force
done
```

## Proposed solution

Add two flags to `spec generate-metadata`:

1. **`--all`** — batch mode. Iterates over specs filtered by `--status` and generates metadata for each. Requires `--write` (batch without writing is useless). Mutually exclusive with the `<specPath>` positional argument.

2. **`--status <values>`** — comma-separated filter for `--all`. Default: `stale,missing`. Accepted values: `stale`, `missing`, `invalid`, `fresh`, or `all` (every spec regardless of status). Requires `--all`.

`--force` retains its existing meaning (skip conflict detection) and works with both single-spec and `--all` modes.

## Specs affected

### Modified specs

- `cli:cli/spec-generate-metadata`: add `--all`, `--status` flags and batch output format

## Impact

| Layer                              | Change                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **CLI** (`spec generate-metadata`) | Add `--all`, `--status` flags; iterate over `ListSpecs` results; call `GenerateSpecMetadata` + `SaveSpecMetadata` per spec |
| **Core**                           | No changes — existing `GenerateSpecMetadata` and `ListSpecs` use cases are sufficient                                      |

## Open questions

None.
