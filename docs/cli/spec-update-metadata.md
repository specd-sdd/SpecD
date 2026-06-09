# spec update-metadata

Update spec metadata with LLM-optimized fields (`optimizedDescription`, `optimizedContext`).

This command performs a **fresh deterministic extraction** from the current `spec.md` and other artifacts, merges the provided LLM optimizations, and saves the resulting `metadata.json`. This ensures that deterministic fields are never lost or stale when an agent updates the metadata.

## Usage

```bash
specd spec update-metadata <specId> [options]
```

## Options

| Option                      | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `--input <file>`            | Read JSON/YAML content from a file instead of stdin. |
| `--format text\|json\|toon` | Output format.                                       |
| `--config <path>`           | Config file path.                                    |

## Input Schema (Partial)

The input should be a JSON or YAML object containing one or more of the following fields:

```yaml
optimizedDescription: 'Concise, high-signal description for agent search.'
optimizedContext: 'Optimized representation for context injection.'
```

## Examples

```bash
# Update from stdin
echo 'optimizedDescription: "New AI summary"' | specd spec update-metadata core:config

# Update from a file
specd spec update-metadata core:config --input optimization.yaml
```
