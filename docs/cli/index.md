---
title: CLI Reference Index
description: Comprehensive directory of all SpecD CLI commands, options, and reference documentation
sidebar_position: 0
---

# CLI Reference Index

The `specd` CLI provides command-line interfaces for developer interaction, CI/CD automation, and agent tool invocation.

For a tutorial-style walkthrough and high-level workflow overview, see the [CLI User Guide](../guide/cli.md).

## Global Options

The following flags apply to all `specd` commands:

| Flag                          | Description                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--config <path>`             | Specify an explicit path to `specd.yaml`. Skips automatic directory traversal.                                    |
| `-v, --verbose`               | Increase logging verbosity (`-v` for info, `-vv` for debug/trace).                                                |
| `--format <text\|json\|toon>` | Output format. Interactive terminal defaults to `text`. Agents typically use `toon` for compact token efficiency. |

---

## Command Families

| Command Family                    | Description                                                                                    | Documentation                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| `specd guide`                     | Retrieve on-demand documentation topics, outline metadata, section slices, and BM25 search.    | [Guide Reference](./guide.md)         |
| `specd changes`                   | Manage active development changes, lifecycle state transitions, artifact DAGs, and validation. | [Changes Reference](./changes.md)     |
| `specd drafts`                    | List, inspect, and restore shelved change drafts.                                              | [Drafts Reference](./drafts.md)       |
| `specd discarded`                 | Browse and inspect abandoned or discarded changes.                                             | [Discarded Reference](./discarded.md) |
| `specd archive`                   | Browse permanently archived changes and delta audit records.                                   | [Archive Reference](./archive.md)     |
| `specd specs`                     | Search, inspect, validate, and manage project specifications.                                  | [Specs Reference](./specs.md)         |
| `specd project` (or `specd init`) | Project initialization, workspace context compilation, and dashboard.                          | [Project Reference](./project.md)     |
| `specd schema`                    | Inspect, extend, fork, and validate workflow schemas.                                          | [Schema Reference](./schema.md)       |
| `specd graph`                     | Index codebase, analyze blast-radius impact, find hotspots, and search symbols.                | [Graph Reference](./graph.md)         |
| `specd config`                    | Inspect resolved configuration cascade and active settings.                                    | [Config Reference](./config.md)       |
| `specd storage`                   | Rebuild internal index caches and workspaces storage.                                          | [Storage Reference](./storage.md)     |
| `specd plugins`                   | Install, inspect, update, and manage agent and workflow plugins.                               | [Plugins Reference](./plugins.md)     |

---

## Output Formats

SpecD CLI supports four output formats via `--format <format>`:

1. **`text`**: Human-readable tables, colors, and progress indicators optimized for terminal users.
2. **`markdown`**: GitHub Flavored Markdown output for documentation and rendering in markdown viewers.
3. **`json`**: Structured JSON payloads suitable for scripting, tooling, and pipeline integrations.
4. **`toon`**: Ultra-compact token-optimized format specifically designed for LLMs and autonomous AI agents.
