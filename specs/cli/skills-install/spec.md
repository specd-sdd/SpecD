# Skills Install

## Purpose

Manually copying skill files into agent command directories is tedious and easy to get wrong. The `specd skills install <name|all>` command reads skill content from `@specd/skills`, writes it to the agent-specific target path, and calls `RecordSkillInstall` in `@specd/core` to persist the installation in the project manifest.

## Requirements

### Requirement: Command signature

```
specd skills install <name|all> [--agent claude] [--global] [--format text|json|toon]
```

- `<name|all>` — required positional; the name of a specific skill to install, or `all` to install every skill in `@specd/skills`.
- `--agent <id>` — optional; the target agent (e.g. `claude`). Defaults to `claude`.
- `--global` — optional; installs to the user-level commands directory instead of the project-level directory. Without this flag, installation is project-level.
- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Skill content resolution

The CLI reads the skill name and markdown content from `@specd/skills`. Core is never involved in this step — `@specd/skills` depends on `@specd/core`, not the other way around, so core cannot import from skills.

### Requirement: Installation target

The CLI resolves the target path based on the agent ID and scope. Each agent ID maps to a commands directory — for example, `claude` uses `<git-root>/.claude/commands/` (project-level) and `~/.claude/commands/` (user-level). The resolution of the commands directory for a given agent ID is defined per agent.

If the agent ID is not recognised, the command exits with code 1 and prints an `error:` message to stderr.

The target directory is created if it does not exist. The CLI writes the file directly to disk — this is adapter-layer filesystem work, not domain logic.

### Requirement: Overwrite behaviour

If a skill file already exists at the target path, it is silently overwritten. Install is always idempotent.

### Requirement: Recording project-level installations

After a successful **project-level** install, the CLI calls `RecordSkillInstall` from `@specd/core`, passing the agent id and the list of installed skill names. `RecordSkillInstall` uses `ConfigWriter` to update the skills manifest in `specd.yaml`. The CLI has no knowledge of `specd.yaml`'s format — it only provides the typed input.

- User-level installs (`--global`) do **not** call `RecordSkillInstall` — global installs are not tracked.
- If `specd.yaml` does not exist, `RecordSkillInstall` returns a `ProjectNotInitialisedError`. The CLI exits with code 1 and prints an `error:` message **before** writing any skill files.

### Requirement: Output on success

- `text` (default): prints one line per installed skill to stdout:

  ```
  installed <name> → <absolute-path>
  ```

  When `all` is used, one line per skill.

- `json` or `toon`: outputs an array:

  ```json
  [{ "name": "...", "path": "..." }]
  ```

### Requirement: Skill not found

If the named skill does not exist in `@specd/skills`, the command exits with code 1 and prints an `error:` message to stderr. No files are written and `RecordSkillInstall` is not called.

### Requirement: Not in a git repository (project-level install)

If `--global` is not provided and the command is run outside any git repository, the command exits with code 1 and prints an `error:` message to stderr advising the user to use `--global` or run from inside a git repository.

### Requirement: Unknown agent

If an unsupported `--agent` value is provided, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- `all` installs every skill exported by `@specd/skills`; if the set is empty the command exits with code 0 and prints `no skills to install`
- Skill file content comes from `@specd/skills` verbatim — no templating or substitution
- **CLI responsibility:** read skill content from `@specd/skills`, resolve agent path, write `.md` file to disk
- **Core responsibility:** persist the installation record in `specd.yaml` via `RecordSkillInstall` → `ConfigWriter`

## Examples

```
# Install a specific skill at project level (default agent: claude)
specd skills install my-skill

# Install all skills at project level
specd skills install all

# Install a skill globally for the current user (not recorded in specd.yaml)
specd skills install my-skill --global

# Machine-readable output
specd skills install all --format json
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — exit codes, output conventions
- [`specs/cli/skills-list/spec.md`](../skills-list/spec.md) — available skills source (`@specd/skills`)
- [`specs/core/config/spec.md`](../../core/config/spec.md) — `RecordSkillInstall` use case, `ConfigWriter` port, skills manifest format
