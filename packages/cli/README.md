# @specd/cli

The command-line interface for [specd](../../README.md) — a spec-driven development platform. Provides commands for managing the full change lifecycle, browsing specs, inspecting configuration and schemas, and managing agent skills.

## Installation

```bash
pnpm add -g @specd/cli
```

Or run directly via pnpm within the monorepo:

```bash
pnpm specd --help
```

## Quick Start

**Initialize a new specd project:**

```bash
specd project init
```

This creates `specd.yaml` in the current directory and scaffolds the workspace layout.

**Basic change workflow:**

```bash
# Create a change and associate it with specs
specd change create add-auth-flow --spec auth/login --spec auth/logout

# Check its status at any point
specd change status add-auth-flow

# Advance to the next lifecycle state
specd change transition add-auth-flow --next

# Approve at a lifecycle gate
specd change approve spec add-auth-flow --reason "Meets requirements"

# Archive once work is complete
specd change archive add-auth-flow
```

**Invoke with no subcommand** — if a `specd.yaml` is discoverable from the current directory, the project dashboard is shown automatically.

## Command Groups

| Group       | Description                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| `change`    | Create, list, inspect, and progress changes through the lifecycle. Core day-to-day commands. |
| `drafts`    | Browse and restore changes that have been shelved with `change draft`.                       |
| `discarded` | List and inspect changes that were discarded.                                                |
| `archive`   | Browse changes that have been archived (completed work).                                     |
| `spec`      | List, show, validate, and manage spec files.                                                 |
| `project`   | Initialize and inspect the specd project (`init`, `context`, `update`, `dashboard`).         |
| `config`    | Inspect the resolved project configuration.                                                  |
| `schema`    | Introspect, fork, extend, and validate schemas.                                              |
| `skills`    | List, install, and update agent skills.                                                      |
| `graph`     | Code graph intelligence: index, search, impact analysis, hotspots.                           |

## Global Options

| Option                      | Description                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--config <path>`           | Use this config file directly. Skips normal file discovery. Applies to all subcommands.                   |
| `--format text\|json\|toon` | Output format. `text` is the default; `json` is suitable for scripting; `toon` is a rich terminal format. |

## Output Formats

- **text** — human-readable tables and prose (default for interactive use)
- **json** — structured output suitable for piping into other tools or scripts
- **toon** — rich, styled terminal output using the toon format

Switch format per-command:

```bash
specd change list --format json
specd change status add-auth-flow --format toon
```

## Full Reference

See [`docs/cli/cli-reference.md`](../../docs/cli/cli-reference.md) for detailed documentation of every command, option, and example.
