---
title: specd drafts
description: CLI reference for managing shelved change drafts
sidebar_position: 3
---

# drafts

The `specd drafts` command family manages shelved changes stored under `.specd/drafts/`. Drafts preserve the exact snapshot of change metadata and artifacts without cluttering the active workspace.

## Commands

```bash
specd drafts list [options]
specd drafts show <name> [options]
specd drafts restore <name> [options]
```

---

## drafts list

List all shelved drafts.

```bash
specd drafts list [options]
```

### Options

| Option                        | Description                                |
| ----------------------------- | ------------------------------------------ |
| `--limit <n>`                 | Maximum drafts to return (default: `100`). |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).    |

---

## drafts show

Inspect the metadata, reason for shelving, and artifact manifest of a shelved draft.

```bash
specd drafts show <name> [options]
```

### Options

| Option                        | Description                             |
| ----------------------------- | --------------------------------------- |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`). |

---

## drafts restore

Restore a shelved draft back into the active changes directory (`.specd/changes/`).

```bash
specd drafts restore <name> [options]
```

### Options

| Option                        | Description                         |
| ----------------------------- | ----------------------------------- |
| `--target-name <new-name>`    | Rename the change upon restoration. |
| `--format <text\|json\|toon>` | Output format.                      |

### Exit Codes

| Exit Code | Condition                                                          |
| --------- | ------------------------------------------------------------------ |
| `0`       | Success.                                                           |
| `1`       | Draft not found, collision with active change, or restore failure. |
