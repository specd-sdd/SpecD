---
title: 'CLI: specs'
description: Complete CLI reference for specd specs and spec commands
sidebar_position: 6
---

# `specd specs` / `specd spec`

The `specs` (or alias `spec`) command family provides tools for listing, inspecting, searching, validating, and managing canonical specification files within workspaces.

```bash
specd specs <command> [options]
specd spec <command> [options]
```

---

## Commands

### `specd specs list`

List all specifications across declared workspaces.

```bash
specd specs list [options]
```

**Options:**

- `--workspace <name>`: Filter specifications by workspace name.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs list
specd specs list --workspace core --format toon
```

---

### `specd specs search <query>`

Search specifications across workspaces by title, description, and requirements.

```bash
specd specs search <query> [options]
```

**Options:**

- `--workspace <name>`: Restrict search to a specific workspace.
- `--limit <n>`: Maximum number of results to return (default: 10).
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs search "token authentication"
specd specs search "session" --workspace core --format json
```

---

### `specd specs show <specId>`

Display the complete specification content (`spec.md`) and metadata for a given spec ID.

```bash
specd specs show <specId> [options]
```

**Options:**

- `--verify`: Display the paired `verify.md` acceptance scenarios instead of `spec.md`.
- `--raw`: Print raw markdown content without metadata wrapping.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs show default:auth/login
specd specs show core:schema-format --verify
```

---

### `specd specs outline <specId>`

Inspect the hierarchical section outline and line spans of a specification.

```bash
specd specs outline <specId> [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs outline default:auth/login
```

---

### `specd specs context <specId>`

Compile and print the context block for a specification, including its dependencies.

```bash
specd specs context <specId> [options]
```

**Options:**

- `--mode <list|summary|full>`: Context rendering mode (default: `full`).
- `--rules`: Filter output to include only rules and requirements.
- `--constraints`: Filter output to include only technical constraints.
- `--scenarios`: Filter output to include only verification scenarios.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs context default:auth/login --mode summary
specd specs context default:auth/login --rules --format toon
```

---

### `specd specs metadata <specId>`

Display the compiled structured metadata (requirements, dependencies, tags, scenario counts) for a spec.

```bash
specd specs metadata <specId> [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs metadata default:auth/login --format toon
```

---

### `specd specs resolve-path <specId>`

Resolve the absolute filesystem path for a given spec ID.

```bash
specd specs resolve-path <specId>
```

**Examples:**

```bash
specd specs resolve-path default:auth/login
```

---

### `specd specs validate [specId]`

Validate specifications against schema requirements and markdown structural syntax. If `specId` is omitted, validates all specifications in the project.

```bash
specd specs validate [specId] [options]
```

**Options:**

- `--workspace <name>`: Validate all specs within a specific workspace.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs validate default:auth/login
specd specs validate --workspace core
```

---

### `specd specs init <specId>`

Scaffold a new canonical specification directory with starter `spec.md` and `verify.md` templates.

```bash
specd specs init <specId> [options]
```

**Options:**

- `--title <title>`: Human-readable title for the capability.
- `--description <desc>`: Summary description.

**Examples:**

```bash
specd specs init default:billing/subscriptions --title "Subscription Management"
```

---

### `specd specs schema`

Display the specification schema format rules and frontmatter requirements.

```bash
specd specs schema [options]
```

**Options:**

- `--format <text|json|toon>`: Output format (default: `text`).

---

### `specd specs deps <specId>`

List or update dependencies (`dependsOn`) for a canonical specification.

```bash
specd specs deps <specId> [options]
```

**Options:**

- `--add <targetSpecId>`: Add a dependency.
- `--remove <targetSpecId>`: Remove a dependency.
- `--replace <commaSeparatedIds>`: Replace all dependencies.
- `--format <text|json|toon>`: Output format (default: `text`).

**Examples:**

```bash
specd specs deps default:auth/login --add default:auth/tokens
```

---

### `specd specs implementation <specId>`

Inspect or update confirmed code implementation symbols and files mapped to a specification.

```bash
specd specs implementation <specId> [options]
```

**Options:**

- `--file <path>`: Source file path relative to workspace.
- `--symbol <name>`: Symbol name (repeatable).
- `--format <text|json|toon>`: Output format (default: `text`).

---

### `specd specs generate-metadata`

Regenerate metadata files (`metadata.yaml`) across all specifications.

```bash
specd specs generate-metadata [options]
```

**Options:**

- `--workspace <name>`: Restrict metadata generation to a workspace.

---

### `specd specs optimizations`

Inspect token optimization diagnostics and recommended spec adjustments.

```bash
specd specs optimizations [specId] [options]
```
