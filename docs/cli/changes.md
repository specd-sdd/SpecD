---
title: specd changes
description: CLI reference for managing active spec-driven changes and their lifecycle
sidebar_position: 2
---

# changes

The `specd changes` (alias `specd change`) command family manages active development changes in SpecD. A change is the core unit of work: it defines which specs are being created or updated, tracks required artifact files through the schema DAG, and drives the lifecycle from drafting through implementation to verification and archiving.

## Commands

```bash
specd changes create <name> [options]
specd changes list [options]
specd changes status <name> [options]
specd changes transition <name> <step> [options]
specd changes draft <name> [options]
specd changes edit <name> [options]
specd changes validate <name> [options]
specd changes approve <name> <spec|signoff> [options]
specd changes context <name> [options]
specd changes artifacts <name> [options]
specd changes skip-artifact <name> <artifact> [options]
specd changes deps <name> [specId] [options]
specd changes check-overlap <name> [options]
specd changes spec-preview <name> [options]
specd changes invalidate <name> [options]
specd changes implementation <subcommand> <name> [options]
specd changes run-hooks <name> <state> [options]
specd changes hook-instruction <name> <state> [options]
specd changes artifact-instruction <name> <artifact> [options]
specd changes discard <name> [options]
specd changes archive <name> [options]
```

---

## changes create

Create a new change directory under `.specd/changes/<date>-<name>` and initialize its manifest.

```bash
specd changes create <name> [options]
```

### Options

| Option                        | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `--spec <id>`                 | Spec ID (repeatable). Each value is one raw ID — never comma-split. Bare IDs mean `default`. |
| `--description <text>`        | Summary of the change intent.                                                                |
| `--invalidation-policy <p>`   | Invalidation policy (`none`, `surgical`, `downstream`, `global`). Default: `downstream`.     |
| `--format <text\|json\|toon>` | Output format.                                                                               |
| `--config <path>`             | Path to configuration file.                                                                  |

Invalid `--spec` syntax fails with `INVALID_SPEC_ID`; an unknown workspace fails with `WORKSPACE_NOT_FOUND`.

---

## changes list

List active changes.

```bash
specd changes list [options]
```

### Options

| Option                        | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `--limit <n>`                 | Maximum entries to return (default: `100`; use `all` for no limit). |
| `--page <p>`                  | 1-based page number.                                                |
| `--description`               | Include change description as a dim sub-row.                        |
| `--format <text\|json\|toon>` | Output format.                                                      |

---

## changes status

Inspect the full state of a change, including the ASCII artifact DAG, blockers, next actions, and spec dependencies.

```bash
specd changes status <name> [options]
```

### Output Details

- **Artifact DAG**: Tree visualization showing the status of each artifact (`missing`, `in-progress`, `complete`, `skipped`, `drifted-pending-review`, etc.).
- **Blockers**: Specific condition codes blocking state transitions.
- **Next Action**: Recommended next CLI or agent command.

---

## changes transition

Advance or roll back the lifecycle state of a change.

```bash
specd changes transition <name> <step> [options]
specd changes transition <name> --next [options]
```

### Options

| Option                        | Description                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `--next`                      | Automatically resolve and execute the next forward transition.                |
| `--skip-hooks <phases>`       | Skip hooks (`source.pre`, `source.post`, `target.pre`, `target.post`, `all`). |
| `--format <text\|json\|toon>` | Output format.                                                                |

---

## changes draft

Shelve an active change into `.specd/drafts/` for later resumption.

```bash
specd changes draft <name> [options]
```

### Options

| Option            | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `--reason <text>` | Shelving rationale.                                                 |
| `--force`         | Required if the change previously reached the `implementing` state. |

---

## changes edit

Modify metadata of an active change (e.g. description, associated specs).

```bash
specd changes edit <name> [options]
```

### Options

| Option                        | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `--add-spec <id>`             | Add a spec ID (repeatable). Raw ID — never comma-split. Bare means `default`.        |
| `--remove-spec <id>`          | Remove a spec ID (repeatable). Raw ID — never comma-split (syntax not re-validated). |
| `--description <text>`        | Update change description.                                                           |
| `--invalidation-policy <p>`   | Invalidation policy (`none`, `surgical`, `downstream`, `global`).                    |
| `--format <text\|json\|toon>` | Output format.                                                                       |
| `--config <path>`             | Path to configuration file.                                                          |

`--add-spec` validates like `changes create --spec` (`INVALID_SPEC_ID` / `WORKSPACE_NOT_FOUND`).

---

## changes validate

Validate that change artifacts satisfy schema rules and contain no drifted content.

```bash
specd changes validate <name> [options]
specd changes validate --all [options]
```

### Options

| Option                        | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `--artifact <id>`             | Validate only the specified artifact.             |
| `--all`                       | Batch validate all active changes in the project. |
| `--format <text\|json\|toon>` | Output format.                                    |

---

## changes approve

Record spec or signoff approvals when approval gates are enabled.

```bash
specd changes approve <name> spec [options]
specd changes approve <name> signoff [options]
```

---

## changes context

Generate and emit compiled change context (manifest, specs, schemas, and instructions) for AI agents.

```bash
specd changes context <name> [options]
```

---

## changes artifacts

List, add, or inspect artifact files associated with a change.

```bash
specd changes artifacts <name> [options]
```

---

## changes skip-artifact

Mark an optional or conditionally needed artifact as skipped in the change DAG.

```bash
specd changes skip-artifact <name> <artifact> [options]
```

---

## changes deps

Add, remove, replace, or clear declared spec dependencies for a change, or list current dependencies when no modification flags are provided. Modification flags require `<specId>`.

```bash
specd changes deps <name> [specId] [options]
```

### Options

| Option                        | Description                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `--add <id>`                  | Add a dependency spec ID (repeatable). Raw ID — never comma-split. Bare IDs mean `default`.      |
| `--remove <id>`               | Remove a dependency spec ID (repeatable). Raw ID — never comma-split.                            |
| `--set <id>`                  | Replace all dependencies (repeatable; mutually exclusive with `--add` / `--remove` / `--clear`). |
| `--clear`                     | Clear all dependencies for the spec (mutually exclusive with `--add` / `--remove` / `--set`).    |
| `--force`                     | Skip confirmation for `--clear`.                                                                 |
| `--format <text\|json\|toon>` | Output format.                                                                                   |
| `--config <path>`             | Path to configuration file.                                                                      |

With `<specId>` and no modification flags, the command shows that spec's dependencies using the normalized fully-qualified ID (e.g. `changes deps my-change auth/login` prints `default:auth/login`). An invalid ID fails with `INVALID_SPEC_ID`; an unknown workspace fails with `WORKSPACE_NOT_FOUND`. The ID is validated by core (`kernel.changes.getSpecDeps`), not by the CLI.

Mutation output also uses fully-qualified IDs. For example, `changes deps my-change auth/login --add auth/shared` prints `dependsOn: default:auth/shared`. JSON/TOON output keeps the same canonical IDs in `specId` and `dependsOn`.

---

## changes check-overlap

Detect overlapping spec modifications across concurrent active changes.

```bash
specd changes check-overlap <name> [options]
```

---

## changes spec-preview

Preview how deltas will apply onto target specs before archiving.

```bash
specd changes spec-preview <name> [options]
```

---

## changes invalidate

Mark downstream artifacts as invalidated following upstream changes.

```bash
specd changes invalidate <name> [options]
```

---

## changes implementation

Track and register implementation files and code references associated with this change.

```bash
specd changes implementation <subcommand> <name> [options]
```

Subcommands: `start`, `list`, `review`, `add`, `remove`, `ignore`, `resolve`, `unresolve`.

`--file` takes raw project-relative path(s). Use a listed form (`--file a.ts b.ts`) or repeat the flag. Commas are **not** separators. `add` / `remove` take a single `--file <path>`; `ignore` / `resolve` / `unresolve` take `--file <paths...>`.

---

## changes run-hooks

Run lifecycle hooks manually for a given state and phase.

```bash
specd changes run-hooks <name> <state> --phase <pre|post> [options]
```

---

## changes discard

Discard an active change and move it to `.specd/discarded/`.

```bash
specd changes discard <name> [options]
```

---

## changes archive

Archive an approved and verified change, merging all delta files into the source specifications.

```bash
specd changes archive <name> [options]
```

### Options

| Option                        | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `--skip-hooks`                | Bypass pre/post archive hooks.                     |
| `--force`                     | Force archive even if non-critical warnings exist. |
| `--format <text\|json\|toon>` | Output format.                                     |
