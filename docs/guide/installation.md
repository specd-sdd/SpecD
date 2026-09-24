---
title: Installation & Initialization
description: Step-by-step guide to installing the SpecD CLI, system prerequisites, project initialization, and agent plugin setup.
sidebar_position: 2
---

# Installation & Initialization

This guide walks you through installing the SpecD CLI on your machine and initializing SpecD in a new or existing repository.

---

## 1. Prerequisites & System Requirements

Before installing SpecD, ensure your environment meets the following requirements:

| Component            | Minimum Version                                | Notes                                                                         |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| **Node.js**          | `>= 20.18.0` (LTS recommended)                 | SpecD is distributed as ESM JavaScript. Check with `node -v`.                 |
| **Package Manager**  | `npm` (>= 10), `pnpm` (>= 9), `yarn`, or `bun` | SpecD works with any standard package manager.                                |
| **VCS**              | Git `>= 2.30` or Mercurial (`hg`)              | SpecD detects repository root, current branch, and clean state automatically. |
| **Operating System** | macOS, Linux, or Windows (WSL recommended)     | Fully cross-platform.                                                         |

---

## 2. Installing the SpecD CLI

The primary SpecD CLI is distributed as `@specd/specd` (or `@specd/cli` directly):

### Global Installation (Recommended)

Installing globally gives you the `specd` executable anywhere in your terminal:

```bash npm2yarn
npm install -g @specd/specd
```

Verify the installation:

```bash
specd --version
which specd
```

### Local Project Dependency

If you prefer to lock SpecD to a specific repository version:

```bash npm2yarn
npm install --save-dev @specd/specd
```

You can then run commands via `npx specd` or package scripts:

```json title="package.json"
{
  "scripts": {
    "specd": "specd"
  }
}
```

### Direct Execution with `npx`

You can also run SpecD commands without installing:

```bash
npx @specd/specd --help
```

---

## 3. Initializing SpecD in a Project

To set up SpecD in your repository, run the initialization command in the project root:

```bash
specd project init
```

_(You can also use the shorthand `specd init`.)_

### Interactive Mode (TTY)

When executed in a terminal without flags, `specd project init` launches an interactive wizard powered by `@clack/prompts`:

1. **Schema reference:** Defaults to `@specd/schema-std` (the standard proposal-spec-design-tasks workflow).
2. **Default workspace ID:** Defaults to `default`.
3. **Specs directory path:** Defaults to `specs/`.
4. **Agent plugins selection:** A multiselect list of agent plugins to install immediately:
   - `@specd/plugin-agent-claude` (Anthropic Claude Code / `.claude/`)
   - `@specd/plugin-agent-copilot` (GitHub Copilot / `.github/`)
   - `@specd/plugin-agent-codex` (OpenAI Codex / `.codex/`)
   - `@specd/plugin-agent-opencode` (OpenCode / `.opencode/`)
   - `@specd/plugin-agent-standard` (Standard agent skills / `.agents/`)
5. **Confirmation:** Confirms file creation or overwriting if `specd.yaml` already exists.

```text
┌  specd project init
│
◆  Schema reference:
│  @specd/schema-std
│
◆  Default workspace ID:
│  default
│
◆  Specs path:
│  specs/
│
◆  Select plugins to install:
│  ◻ @specd/plugin-agent-claude
│  ◻ @specd/plugin-agent-copilot
│  ◻ @specd/plugin-agent-codex
│  ◻ @specd/plugin-agent-opencode
│  ◼ @specd/plugin-agent-standard
│
└  initialized specd in /path/to/project
```

### Non-Interactive / CI Mode

For scripts, Docker builds, or CI environments, pass the desired options as command-line flags:

```bash
specd project init \
  --schema @specd/schema-std \
  --workspace default \
  --workspace-path specs/ \
  --plugin @specd/plugin-agent-claude \
  --plugin @specd/plugin-agent-standard \
  --force \
  --format json
```

#### Command Options

| Option                        | Description                                       | Default             |
| ----------------------------- | ------------------------------------------------- | ------------------- |
| `--schema <ref>`              | Schema package reference or local path            | `@specd/schema-std` |
| `--workspace <id>`            | Identifier for the default workspace              | `default`           |
| `--workspace-path <path>`     | Path to the directory where specs live            | `specs/`            |
| `--plugin <name>`             | Agent plugin to install after init (repeatable)   | `[]`                |
| `--force`                     | Overwrite existing `specd.yaml` without prompting | `false`             |
| `--format <text\|json\|toon>` | Output format                                     | `text`              |

---

## 4. What Initialization Creates

Running `specd project init` sets up the foundational directory structure and files:

```
my-project/
├── specd.yaml                  # Core configuration file
├── specs/                      # Living specifications workspace directory
├── .specd/                     # SpecD metadata & state storage
│   ├── changes/                # Active change units
│   ├── drafts/                 # Paused / shelved changes
│   ├── discarded/              # Abandoned change audit logs
│   ├── archive/                # Archived completed changes
│   └── metadata/               # Local index & graph cache (gitignored)
└── .gitignore                  # Automatically appended with metadata cache entries
```

### `specd.yaml`

The generated configuration file declares your schema and default workspace:

```yaml title="specd.yaml"
schema: '@specd/schema-std'

workspaces:
  default:
    specsPath: specs/

plugins:
  agents:
    - name: '@specd/plugin-agent-standard'
```

### Automatic `.gitignore` Updates

SpecD automatically updates your `.gitignore` to prevent transient caches and local overrides from being committed:

```gitignore title=".gitignore (appended by SpecD)"
# SpecD metadata and local cache
/.specd/metadata/
specd.local.yaml
specd.local.*.yaml
```

---

## 5. Installing and Managing Agent Plugins

Agent plugins configure your coding assistant (Claude Code, GitHub Copilot, OpenAI Codex, OpenCode, or custom agents) with the SpecD slash skills (`/specd`, `/specd-new`, `/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`).

### Adding Plugins Post-Init

If you did not select a plugin during initialization or want to add another agent:

```bash
specd plugins install @specd/plugin-agent-claude
```

You can install multiple plugins in a single command:

```bash
specd plugins install @specd/plugin-agent-claude @specd/plugin-agent-copilot
```

### Listing Installed Plugins

Check runtime status and loaded versions:

```bash
specd plugins list
```

Example output:

```text
Installed plugins:
@specd/plugin-agent-claude    agents  0.2.0  installed
@specd/plugin-agent-copilot   agents  0.2.0  installed
```

### Inspecting Plugin Capabilities

```bash
specd plugins show @specd/plugin-agent-claude
```

### Updating or Uninstalling Plugins

```bash
# Update installed plugins
specd plugins update @specd/plugin-agent-claude

# Remove a plugin and remove its skills
specd plugins uninstall @specd/plugin-agent-copilot
```

---

## 6. Verifying Your Setup

Once initialized, verify that your project configuration and plugins are valid:

```bash
specd project status
```

You should see output confirming:

- The active schema (`@specd/schema-std`).
- The configured workspaces (`default`).
- Zero active changes (clean slate).
- VCS adapter status (branch and clean working tree).

---

## Next Steps

Now that SpecD is installed and initialized:

- Follow the [Quickstart / Getting Started Tutorial](./getting-started.md) to open your first change.
- Understand the [Philosophy of Spec-Driven Development](./philosophy.md).
- Learn about [Skills](./skills.md) and how to interact with your AI coding assistant.
