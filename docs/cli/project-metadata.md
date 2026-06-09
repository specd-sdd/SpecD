# project metadata

Display the full contents of the `project-metadata.json` file.

This is primarily used for debugging the project optimization status and inspecting the cached freshness hashes.

## Usage

```bash
specd project metadata [options]
```

## Options

| Option                      | Description       |
| --------------------------- | ----------------- |
| `--format text\|json\|toon` | Output format.    |
| `--config <path>`           | Config file path. |

## Output Schema

```json
{
  "version": 1,
  "optimized": {
    "context": "..."
  },
  "freshness": {
    "algorithm": "sha256",
    "inputs": {
      "config": { "path": "specd.yaml", "hash": "..." },
      "contextFiles": [ ... ],
      "specMetadata": [ ... ]
    },
    "combinedHash": "..."
  },
  "generated": {
    "at": "2026-06-03T10:30:00.000Z"
  }
}
```
