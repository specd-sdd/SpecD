---
title: 'CLI: plugins'
description: Complete CLI reference for specd plugins commands
sidebar_position: 11
---

# `specd plugins`

The `plugins` command family manages agent adapters, schema plugins, and workflow extension packages within your SpecD project.

```bash
specd plugins <command> [options]
```

---

## Commands

### `specd plugins list`

List all currently installed or registered plugins and their enabled status.

```bash
specd plugins list [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd plugins list
specd plugins list --format toon
```

---

### `specd plugins show <name>`

Inspect detailed metadata, configuration options, hooks, and capabilities declared by a plugin.

```bash
specd plugins show <name> [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd plugins show @specd/plugin-agent-claude
```

---

### `specd plugins install <name>`

Install and register an agent skill plugin or schema extension.

```bash
specd plugins install <name> [options]
```

**Options:**

- `--save-exact`: Save exact version in `specd.yaml`.
- `--global`: Install plugin globally for the user environment.

**Examples:**

```bash
specd plugins install @specd/plugin-agent-copilot
```

---

### `specd plugins update [name]`

Update one or all installed plugins to their latest compatible versions.

```bash
specd plugins update [name] [options]
```

**Examples:**

```bash
specd plugins update
specd plugins update @specd/plugin-agent-claude
```

---

### `specd plugins uninstall <name>`

Uninstall a plugin and remove its configuration and hooks from `specd.yaml`.

```bash
specd plugins uninstall <name> [options]
```

**Examples:**

```bash
specd plugins uninstall @specd/plugin-agent-standard
```
