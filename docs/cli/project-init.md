# project init

`specd project init` initializes `specd.yaml` and can install plugins in the same flow.

## Command

```bash
specd project init [options]
```

Options:

- `--schema <ref>` schema reference (default: `@specd/schema-std`)
- `--workspace <id>` default workspace id (default: `default`)
- `--workspace-path <path>` specs path (default: `specs/`)
- `--plugin <name>` plugin to install after init (repeatable)
- `--force` overwrite existing `specd.yaml`
- `--format <text|json|toon>` output format (default: `text`)

## Behavior

- Initializes project config and storage via core `InitProject`.
- Supports interactive setup when run in TTY text mode with no flags:
  - asks schema/workspace/specs path
  - offers multi-select plugin installation (an empty selection is valid and installs nothing)
  - when `specd.yaml` already exists, asks for confirmation naming its path and warning that overwriting replaces the configuration, including its declared plugins and workspaces
- Cancelling any prompt, or declining the overwrite, writes nothing and exits with code `0`.
- Plugin installation after init uses the same orchestration as `plugins install`.
- Plugin declarations are persisted in the flat `plugins` list. `specd project init` writes `configVersion: 2`.
- Creates `.specd/metadata/` and appends `/.specd/metadata/` to the root `.gitignore` (idempotent).
- Exits with code `1` if any selected plugin installation fails.

## Metadata cache migration

If an existing repository committed `.specd/metadata/` before it was gitignored, untrack it manually (specd does not run `git rm --cached` for you):

```bash
git rm -r --cached .specd/metadata
git commit -m "chore: stop tracking specd metadata cache"
```

## Output

Text output:

```text
initialized specd in <project-root>
plugins: <status> <plugin-name> (<detail>)
```

JSON/TOON output:

```json
{
  "result": "ok",
  "configPath": "/abs/path/specd.yaml",
  "schema": "@specd/schema-std",
  "workspaces": ["default"],
  "plugins": []
}
```
