---
title: specd storage
description: CLI reference for managing SpecD storage engines and caches
sidebar_position: 9
---

# storage

The `specd storage` command family provides management utilities for SpecD internal caches and persisted index stores.

## Commands

```bash
specd storage reindex [options]
```

---

## storage reindex

Rebuild internal storage indices and metadata caches across all configured workspaces.

```bash
specd storage reindex [options]
```

### Options

| Option                        | Description                             |
| ----------------------------- | --------------------------------------- |
| `--config <path>`             | Path to configuration file.             |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). |

### Exit Codes

| Exit Code | Condition                       |
| --------- | ------------------------------- |
| `0`       | Storage reindexed successfully. |
| `1`       | Reindexing failed.              |
