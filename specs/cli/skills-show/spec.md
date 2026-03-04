# Skills Show

## Overview

Defines the `specd skills show <name>` command, which prints the full content of a named skill bundled in `@specd/skills`.

## Requirements

### Requirement: Command signature

```
specd skills show <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the skill to display.
- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Output format

In `text` mode (default), the command prints the raw markdown content of the skill file to stdout, preceded by a header line:

```
--- <name> ---
<markdown content>
```

In `json` or `toon` mode, the output is:

```json
{ "name": "...", "description": "...", "content": "..." }
```

Where `content` is the full markdown text of the skill.

### Requirement: Skill not found

If no skill with the given name exists in `@specd/skills`, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- The command is read-only — it never modifies any files
- `content` in JSON/toon output is the verbatim file content, not parsed or transformed

## Examples

```
$ specd skills show my-skill
--- my-skill ---
# Skill title
...

$ specd skills show my-skill --format json
{"name":"my-skill","description":"Short description of the skill","content":"# Skill title\n..."}
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — exit codes, output conventions
- [`specs/cli/skills-list/spec.md`](../skills-list/spec.md) — available skills source
