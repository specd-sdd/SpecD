# spec metadata

Show self-healed metadata for a spec.

## Usage

```bash
specd specs metadata <specPath> [--format text|json|toon]
```

## Output

Includes the materialized projection (title, description, rules, constraints, scenarios, `dependsOn`, implementation summary) plus diagnostics:

- `source` — `persisted` (cache reused) or `generated` (rebuilt)
- `regenerated` — `true` when the cache was rebuilt during this read
- `warnings` — cache-write failures or other materialization warnings

Deleting `.specd/metadata/<spec>.json` is safe: the next `specs metadata` call rebuilds the cache transparently.

## Related

- Persisted state: `specs deps`, `specs implementation`, `specs optimizations`, `specs schema`
- Forced rebuild: `specs generate-metadata`

Removed: `specs write-metadata`, `specs update-metadata`, `specs invalidate-metadata`.
