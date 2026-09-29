---
title: specd archive
description: CLI reference for browsing and inspecting archived changes
sidebar_position: 5
---

# archive

The `specd archive` command family allows inspecting historical changes that have completed their lifecycle, passed verification, and been archived. Archived changes serve as permanent immutable records of system evolution.

## Commands

```bash
specd archive list [options]
specd archive show <name> [options]
```

---

## archive list

List all archived changes in chronological order.

```bash
specd archive list [options]
```

### Options

| Option                        | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `--limit <n>`                 | Maximum entries to return (default: `100`). |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).     |

---

## archive show

Inspect an archived change record, showing the archived artifacts, original delta patches, execution timestamps, and signature approvals.

```bash
specd archive show <name> [options]
```

### Options

| Option                        | Description                             |
| ----------------------------- | --------------------------------------- |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). |

### Exit Codes

| Exit Code | Condition                  |
| --------- | -------------------------- |
| `0`       | Success.                   |
| `1`       | Archived change not found. |
