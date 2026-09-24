---
title: specd discarded
description: CLI reference for listing and inspecting discarded changes
sidebar_position: 4
---

# discarded

The `specd discarded` command family manages changes that were abandoned or discarded. Discarded changes are archived under `.specd/discarded/` for auditability rather than being permanently deleted.

## Commands

```bash
specd discarded list [options]
specd discarded show <name> [options]
```

---

## discarded list

List all discarded changes in the repository.

```bash
specd discarded list [options]
```

### Options

| Option                        | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `--limit <n>`                 | Maximum entries to return (default: `100`). |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).     |

---

## discarded show

Inspect a discarded change's details, including date of discard, original author, discard rationale, and specs that were targeted.

```bash
specd discarded show <name> [options]
```

### Options

| Option                        | Description                             |
| ----------------------------- | --------------------------------------- |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). |

### Exit Codes

| Exit Code | Condition                   |
| --------- | --------------------------- |
| `0`       | Success.                    |
| `1`       | Discarded change not found. |
