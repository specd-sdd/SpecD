# Project Init

## Purpose

Getting a specd project off the ground requires creating a config file, storage directories, and optionally installing agent skills -- doing this manually is tedious and error-prone. The `specd project init` command bootstraps a new specd project, presenting a guided wizard in interactive mode or proceeding silently with flags in non-interactive mode. All file creation is delegated to the `InitProject` use case in `@specd/core`.

## Requirements

### Requirement: Command signature

```
specd project init [--schema <ref>] [--workspace <id>] [--workspace-path <path>] [--agent <id>...] [--force] [--format text|json|toon]
```

- `--schema <ref>` — optional; the schema reference to activate (e.g. `@specd/schema-std`, `./schemas/custom/schema.yaml`). Defaults to `@specd/schema-std`.
- `--workspace <id>` — optional; the ID of the default workspace. Defaults to `default`.
- `--workspace-path <path>` — optional; the specs path for the default workspace, relative to the config file. Defaults to `specs/`.
- `--agent <id>` — optional, repeatable; agents to install skills for immediately after initialisation (e.g. `--agent claude`). When not provided in interactive mode, the wizard asks.
- `--force` — optional; overwrite an existing config without prompting.
- `--format text|json|toon` — optional; forces non-interactive mode; defaults to `text`.

### Requirement: Interactive mode

The command enters interactive mode when **all** of the following are true:

- stdout is a TTY
- `--format` is not `json` or `toon`
- No configuration flags (`--schema`, `--workspace`, `--workspace-path`, `--agent`) are provided

In interactive mode the command presents a guided wizard:

1. **Welcome header** — an ASCII banner and a short description of specd, shown once at startup.

2. **Project settings prompts** — prompts for each setting with its default value pre-filled:
   - Schema reference (default: `@specd/schema-std`)
   - Default workspace ID (default: `default`)
   - Specs path (default: `specs/`)

3. **Agent selection** — a multi-select listing all known agents. The user selects which agents to install skills for. Selecting none is valid (skills can be installed later with `specd skills install`).

4. **Confirmation summary** — shows the resolved settings and asks for confirmation before writing any files. If the user cancels, the command exits with code 0 and no files are written.

5. **Progress** — a spinner is shown while `InitProject` runs and skills are installed.

6. **Completion** — a success message with the project root path and next-step hints.

### Requirement: Non-interactive mode

When not in interactive mode, the command uses the flag values (or defaults) directly, calls `InitProject`, optionally installs skills for agents specified via `--agent`, and prints output according to `--format`.

- `text`: prints `initialized specd in <absolute-project-root-path>` followed by any skills installed.
- `json` or `toon`: outputs `{"result":"ok","configPath":"...","schema":"...","workspaces":[...],"skillsInstalled":{}}` where `skillsInstalled` maps agent ids to arrays of installed skill names.

### Requirement: Config file placement

The target directory is the **git root** when inside a git repository, or the **current working directory** otherwise. This resolution happens in the CLI before entering the wizard or calling `InitProject`.

### Requirement: Delegation to InitProject

The CLI passes the resolved project root, schema reference, workspace id, workspace specs path, and force flag to `InitProject`. All file creation — `specd.yaml`, storage directories, `.gitignore` entry — is handled by `InitProject` via `ConfigWriter`. The CLI never touches `specd.yaml` directly.

### Requirement: Skills installation after init

After `InitProject` succeeds, if any agents were selected (interactively or via `--agent`), the CLI installs all skills for each selected agent using the same logic as `specd skills install all --agent <id>`, and records the installations in `specd.yaml` via `RecordSkillInstall`.

### Requirement: Already initialised

If `specd.yaml` already exists and `--force` is not provided:

- **Interactive mode**: the wizard informs the user and asks whether to overwrite or cancel.
- **Non-interactive mode**: exits with code 1 and prints an `error:` message to stderr.

## Constraints

- `specd project init` does not require an existing `specd.yaml` to run; standard config discovery is not invoked
- The CLI never reads or writes YAML — all config format knowledge lives in `@specd/core`
- `--schema` accepts any string; validation is deferred to first use
- Interactive mode is never entered when `--format json` or `--format toon` is set, even if stdout is a TTY — these formats imply scripted use

## Examples

```
# Interactive wizard (TTY, no flags)
specd project init

# Fully non-interactive
specd project init --schema @specd/schema-std --workspace default --workspace-path specs/ --agent claude

# Overwrite without prompting
specd project init --force

# Machine-readable output (always non-interactive)
specd project init --format json
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — exit codes, output conventions
- [`cli:cli/skills-install`](../skills-install/spec.md) — skill installation logic called after init
- [`core:core/config`](../../core/config/spec.md) — InitProject use case, ConfigWriter port
