---
title: specd schema
description: CLI reference for inspecting, extending, forking, and validating workflow schemas
sidebar_position: 6
---

# schema

The `specd schema` command family inspects and manages SpecD schemas. Schemas define the required artifacts, lifecycle steps, validation rules, and templates that govern changes.

## Commands

```bash
specd schema show [ref] [options]
specd schema fork <ref> <name> [options]
specd schema extend <ref> <name> [options]
specd schema validate [ref] [options]
```

---

## schema show

Display the full definition of a schema, including artifacts, fields, extraction rules, and lifecycle states.

```bash
specd schema show [ref] [options]
```

When neither `[ref]` nor `--file` is provided, shows the project's active schema as resolved from `specd.yaml`.

### Options

| Option                        | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `--file <path>`               | Show a schema from a local file path. Mutually exclusive with `[ref]`. |
| `--raw`                       | Show raw schema without resolving `extends`, plugins, or overrides.    |
| `--templates`                 | Resolve template references and show template contents directly.       |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).                                |
| `--config <path>`             | Path to configuration file.                                            |

---

## schema fork

Fork an existing schema (such as `@specd/schema-std`) into a local directory with all templates copied, creating a fully standalone schema for custom workflows.

```bash
specd schema fork <ref> <name> [options]
```

### Options

| Option               | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `--workspace <name>` | Target workspace (default: `default`). Mutually exclusive with `--output`. |
| `--output <path>`    | Explicit destination directory. Mutually exclusive with `--workspace`.     |
| `--config <path>`    | Path to configuration file.                                                |

---

## schema extend

Create a lightweight schema that extends an existing parent schema, inheriting its artifacts, lifecycle steps, and templates while allowing overrides.

```bash
specd schema extend <ref> <name> [options]
```

### Options

| Option               | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `--workspace <name>` | Target workspace (default: `default`). Mutually exclusive with `--output`. |
| `--output <path>`    | Explicit destination directory. Mutually exclusive with `--workspace`.     |
| `--config <path>`    | Path to configuration file.                                                |

---

## schema validate

Validate that a schema definition complies with the SpecD schema specification format.

```bash
specd schema validate [ref] [options]
```

### Options

| Option                        | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `--file <path>`               | Path to schema file to validate.                   |
| `--raw`                       | Validate base schema without plugins or overrides. |
| `--format <text\|json\|toon>` | Output format.                                     |

### Exit Codes

| Exit Code | Condition                                                   |
| --------- | ----------------------------------------------------------- |
| `0`       | Schema is valid.                                            |
| `1`       | Schema validation error, schema not found, or syntax error. |
