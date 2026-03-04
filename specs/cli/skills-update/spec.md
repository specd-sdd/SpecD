# Skills Update

## Overview

Defines the `specd skills update` command, which reinstalls all skills recorded in the project manifest from the currently installed `@specd/skills` package. Used after upgrading specd to pick up changes to bundled skill files. The CLI calls `GetSkillsManifest` from `@specd/core` to read what is recorded, then resolves content from `@specd/skills` and writes the files itself — following the same responsibility split as `specd skills install`.

## Requirements

### Requirement: Command signature

```
specd skills update [--agent claude] [--format text|json|toon]
```

- `--agent <id>` — optional; restricts the update to one agent's skills. When omitted, all agents in the manifest are updated.
- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Reading the installation manifest

The CLI calls `GetSkillsManifest` from `@specd/core`, which returns a typed map of `{ [agentId: string]: string[] }`. The CLI never reads `specd.yaml` directly — it has no knowledge of the storage format.

### Requirement: Reinstalling skill files

For each agent and each recorded skill name, the CLI:

1. Looks up the skill content in `@specd/skills` (same as `specd skills install`)
2. Resolves the project-level target path for the agent (e.g. `<git-root>/.claude/commands/<name>.md`)
3. Writes the file to disk, overwriting whatever was there

Core is not involved in steps 1–3. `RecordSkillInstall` is **not** called — the manifest already contains these names; nothing new is being added.

### Requirement: Skill no longer in bundle

If a recorded skill name is not present in the current `@specd/skills` bundle (renamed or removed in an upgrade):

- Prints a warning to stderr: `warning: skill <name> is no longer available — skipped`
- Continues updating the remaining skills
- Exits with code 0

### Requirement: No skills recorded

If the manifest is empty (or empty for the filtered agent), the command prints `no skills to update` to stdout and exits with code 0.

### Requirement: Output on success

- `text` (default): prints one line per updated skill to stdout:

  ```
  updated <name> → <absolute-path>
  ```

- `json` or `toon`: outputs an array:

  ```json
  [{ "name": "...", "path": "...", "status": "updated|skipped", "warning": "..." }]
  ```

  `warning` is omitted when absent.

## Constraints

- Only project-level installs (recorded in the manifest) are updated; user-level (`--global`) installs are not tracked and not touched
- The command never mutates the manifest — it only reads via `GetSkillsManifest`
- Agent IDs in the manifest that are not recognised are skipped with a warning
- **CLI responsibility:** read manifest via `GetSkillsManifest`, read skill content from `@specd/skills`, resolve agent paths, write `.md` files to disk
- **Core responsibility:** return the typed manifest via `GetSkillsManifest` → `ConfigWriter.readSkillsManifest`

## Examples

```
# Update all recorded skills for all agents
specd skills update

# Update only Claude Code skills
specd skills update --agent claude

# Machine-readable output
specd skills update --format json
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/cli/skills-install/spec.md`](../skills-install/spec.md) — file-write path logic and responsibility split
- [`specs/core/config/spec.md`](../../core/config/spec.md) — `GetSkillsManifest` use case, `ConfigWriter` port
