# project update-metadata

Update project-level metadata with LLM-optimized context.

This command computes current SHA-256 hashes for all project context inputs (`specd.yaml`, context files, and included spec metadata) and persists them alongside the provided optimized content into `project-metadata.json`.

The resulting cache is used by `specd project context` and `specd change context` to provide a pre-optimized summary of the project background, significantly reducing token usage for agents.

## Usage

```bash
specd project update-metadata [options]
```

## Options

| Option                      | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `--input <file>`            | Read JSON/YAML content from a file instead of stdin. |
| `--format text\|json\|toon` | Output format.                                       |
| `--config <path>`           | Config file path.                                    |

## Input Schema

The input must be a JSON or YAML object with the following structure:

```yaml
optimizedContext: 'The full optimized project-level context string.'
```

## Examples

```bash
# Update from stdin
echo 'optimizedContext: "You are working on the specd project..."' | specd project update-metadata

# Update from a file
specd project update-metadata --input project-opt.yaml
```
