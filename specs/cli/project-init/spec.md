# Project Init

## Purpose

Getting a specd project off the ground requires creating a config file, storage directories, and optionally installing agent skills -- doing this manually is tedious and error-prone. The `specd project init` command bootstraps a new specd project, presenting a guided wizard in interactive mode or proceeding silently with flags in non-interactive mode. All file creation is delegated to the `InitProject` use case in `@specd/core`.

## Requirements

### Requirement: Command signature

```
specd project init [--schema <ref>] [--workspace <id>] [--workspace-path <path>] [--plugin <name>...] [--force] [--format text|json|toon]
specd init [--schema <ref>] [--workspace <id>] [--workspace-path <path>] [--plugin <name>...] [--force] [--format text|json|toon]
```

`specd init` is a top-level alias for `specd project init`. Both forms SHALL behave identically — same flags, same interactive wizard, same exit codes, same output.

- `--schema <ref>` — optional; the schema reference to activate (e.g. `@specd/schema-std`, `./schemas/custom/schema.yaml`). Defaults to `@specd/schema-std`.
- `--workspace <id>` — optional; the ID of the default workspace. Defaults to `default`.
- `--workspace-path <path>` — optional; the specs path for the default workspace, relative to the config file. Defaults to `specs/`.
- `--plugin <name>` — optional, repeatable; agent plugins to install after initialisation (e.g. `--plugin @specd/plugin-agent-claude`). When not provided in interactive mode, the wizard asks.
- `--force` — optional; overwrite an existing config without prompting.
- `--format text|json|toon` — optional; forces non-interactive mode; defaults to `text`.

### Requirement: Interactive mode

The command enters interactive mode when **all** of the following are true:

- stdout is a TTY
- `--format` is not `json` or `toon`
- No configuration flags (`--schema`, `--workspace`, `--workspace-path`, `--plugin`) are provided

In interactive mode the command presents a guided wizard:

1. **Welcome header** — an ASCII banner and a short description of specd, shown once at startup.
2. **Project settings prompts** — prompts for each setting with its default value pre-filled:
   - Schema reference (default: `@specd/schema-std`)
   - Default workspace ID (default: `default`)
   - Specs path (default: `specs/`)
3. **Plugin selection** — a multi-select listing available agent plugins. The user selects which plugins to install. Selecting none is valid (plugins can be installed later with `specd plugins install`).

### Requirement: Known plugin options

The interactive plugin-selection wizard MUST expose this known agent plugin option set:

- `@specd/plugin-agent-claude`
- `@specd/plugin-agent-copilot`
- `@specd/plugin-agent-codex`
- `@specd/plugin-agent-opencode`

### Requirement: Non-interactive mode

When not in interactive mode, the command uses the flag values (or defaults) directly, calls `InitProject`, optionally installs skills for agents specified via `--agent`, and prints output according to `--format`.

- `text`: prints `initialized specd in <absolute-project-root-path>` followed by any skills installed.
- `json` or `toon`: outputs `{"result":"ok","configPath":"...","schema":"...","workspaces":[...],"skillsInstalled":{}}` where `skillsInstalled` maps agent ids to arrays of installed skill names.

### Requirement: Config file placement

The target directory is the **git root** when inside a git repository, or the **current working directory** otherwise. This resolution happens in the CLI before entering the wizard or calling `InitProject`.

### Requirement: Delegation to InitProject

The CLI passes the resolved project root, schema reference, workspace id, workspace specs path, and force flag to `InitProject`. All file creation — `specd.yaml`, storage directories, `.gitignore` entry — is handled by `InitProject` via `ConfigWriter`. The CLI never touches `specd.yaml` directly.

### Requirement: Skills installation after init

After `InitProject` succeeds, if any plugins were selected (interactively or via `--plugin`), the CLI installs each selected plugin using `specd plugins install`. Each plugin's `install()` method handles writing its skill files.

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
specd init

# Same as above, using the full form
specd project init

# Fully non-interactive
specd init --schema @specd/schema-std --workspace default --workspace-path specs/ --plugin @specd/plugin-agent-claude

# Overwrite without prompting
specd init --force

# Machine-readable output (always non-interactive)
specd init --format json
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — exit codes, output conventions
- [`cli:cli/skills-install`](../skills-install/spec.md) — skill installation logic called after init
- [`core:core/config`](../../core/config/spec.md) — InitProject use case, ConfigWriter port
