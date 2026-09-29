---
title: specd config
description: CLI reference for inspecting resolved configuration cascade
sidebar_position: 8
---

# config

The `specd config` command family allows inspecting the resolved project configuration after merging all layers of the configuration cascade (`specd.yaml`, environment overrides, and `specd.local.yaml`).

## Commands

```bash
specd config show [options]
```

---

## config show

Display the fully resolved project configuration.

```bash
specd config show [options]
```

### Options

| Option                        | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| `--config <path>`             | Path to specific configuration file to load.               |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). Default is `text`. |

### Output

The output displays:

- Active schema reference and configuration.
- Configured workspaces and their specs paths.
- Active plugins and agent definitions.
- Graph inclusion/exclusion patterns.
- Resolved template settings and lifecycle hooks.

### Exit Codes

| Exit Code | Condition                                 |
| --------- | ----------------------------------------- |
| `0`       | Success.                                  |
| `1`       | Configuration syntax or validation error. |
