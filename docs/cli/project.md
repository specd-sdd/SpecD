---
title: 'CLI: project'
description: Complete CLI reference for specd project commands
sidebar_position: 7
---

# `specd project`

The `project` command family manages project-level configuration, initialization, workspace boundaries, metadata, status inspection, and visual dashboards.

```bash
specd project <command> [options]
```

---

## Commands

### `specd project init`

Initialize a new SpecD project in the current directory and interactively generate `specd.yaml`.

```bash
specd project init [options]
```

**Options:**

- `--schema <name>`: Default schema package to configure (e.g. `@specd/schema-std`).
- `--specs-path <path>`: Directory location for specifications (default: `specs`).
- `--force`: Overwrite existing configuration if present.

**Examples:**

```bash
specd project init
specd project init --schema @specd/schema-std --specs-path specs
```

---

### `specd project status`

Inspect current project health, active schema, configured workspaces, specification counts, active changes, and code graph freshness.

```bash
specd project status [options]
```

**Options:**

- `--context`: Include compiled high-level project context.
- `--graph`: Include code graph indexing and freshness metrics.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd project status
specd project status --context --graph --format toon
```

---

### `specd project dashboard`

Display a rich terminal dashboard visualizing project health, active change progress, drift detection, and recent activity.

```bash
specd project dashboard [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

---

### `specd project context`

Compile and display the global project context block (including project-level specifications and global rules).

```bash
specd project context [options]
```

**Options:**

- `--mode <list|summary|full>`: Context rendering mode (default: `summary`).
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd project context --mode summary
specd project context --mode full --format toon
```

---

### `specd project context-specs`

Discover and list specification IDs matching project and workspace include/exclude patterns without rendering full markdown.

```bash
specd project context-specs [options]
```

**Options:**

- `--workspace <name>`: Filter workspace-level rules (repeatable).
- `--workspaces-only`: Omit global project-level specs from output.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd project context-specs
specd project context-specs --workspace core --workspaces-only
```

---

### `specd project metadata`

Display compiled project-level metadata, workspaces layout, and registered capabilities.

```bash
specd project metadata [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

---

### `specd project update`

Update project configuration, workspaces, or schema references.

```bash
specd project update [options]
```

---

### `specd project update-metadata`

Recompile and synchronize project-level metadata caches.

```bash
specd project update-metadata [options]
```
