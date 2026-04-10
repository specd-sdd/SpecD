# Skills List

## Purpose

Users need to discover what skills are available and which ones are already installed for their agent. The `specd skills list` command lists all skills bundled in `@specd/skills` and optionally reports each skill's installation status for a target agent.

## Requirements

### Requirement: Command signature

```
specd skills list [--agent claude] [--format text|json|toon]
```

- `--agent <id>` — optional; the agent to check installation status against (e.g. `claude`). When omitted, installation status is not shown.
- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Output format

In `text` mode (default), the command prints one row per skill to stdout:

```
<name>  <description>  <installed>
```

Where `<installed>` is `installed` or `not installed` when `--agent` is provided, and omitted otherwise.

In `json` or `toon` mode, the output is an array:

```json
[{ "name": "...", "description": "...", "installed": true }]
```

`installed` is omitted from each object when `--agent` is not provided.

### Requirement: Empty skill set

If `@specd/skills` exports no skills, the command prints `no skills available` in `text` mode, or `[]` in `json`/`toon` mode. The process exits with code 0.

### Requirement: Installation check

When `--agent <id>` is provided, the command checks whether a file named `<name>.md` exists in the agent's project-level or user-level commands directory. For example, for `claude` these are `<git-root>/.claude/commands/` and `~/.claude/commands/`. The resolution of the commands directory for a given agent ID is defined per agent.

A skill is considered `installed` if the file exists in either location.

If the agent ID is not recognised, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The command is read-only — it never installs or modifies any files
- Skills are sourced from `@specd/skills` at the version installed alongside the CLI

## Examples

```
$ specd skills list
  my-skill          Short description of the skill
  my-other-skill    Short description of the other skill

$ specd skills list --agent claude
  my-skill          Short description of the skill        installed
  my-other-skill    Short description of the other skill  not installed

$ specd skills list --format json --agent claude
[{"name":"my-skill","description":"Short description of the skill","installed":true}]
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — exit codes, output conventions
