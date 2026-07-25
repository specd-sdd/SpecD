# spec generate-metadata

Force-regenerate metadata projections for one or all specs.

## Usage

```bash
specd specs generate-metadata <specPath>
specd specs generate-metadata --all [--workspace <name>...]
```

## Behavior

Delegates to `RegenerateSpecMetadata` with `policy: force`. Every targeted spec is rebuilt and written to `.specd/metadata/` regardless of cache freshness. Any cache-write failure fails the command.

Batch mode reports per-spec `ok` / `failed` results.

## When to use

Routine workflows should rely on self-healing reads (`specs metadata`, context compilation, archive). Use this command for explicit full-project rebuilds or troubleshooting.

Removed flags: `--write`, `--status`, and `--force` (writes are always attempted; policy is always forced).
