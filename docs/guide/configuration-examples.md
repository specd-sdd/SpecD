---
title: Configuration Examples
description: Practical specd.yaml configuration examples ranging from minimal single-repo setups to multi-workspace coordinators and an exhaustive reference configuration.
sidebar_position: 10
---

# Configuration Examples

This guide provides practical, ready-to-use `specd.yaml` configuration examples for common project architectures, followed by an exhaustive reference configuration demonstrating all available settings in a single file.

---

## Example 1: Minimal Single-Repo Project

This is the standard starting point for most projects: a single Git repository, the default published schema (`@specd/schema-std`), and standard local filesystem storage.

Run `specd project init` in a fresh repository to generate this structure automatically.

### `specd.yaml`

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
```

### Key behaviors

- **Schema:** `@specd/schema-std` is resolved from `node_modules/@specd/schema-std/schema.yaml`. Version pinning is handled via `package.json`.
- **Workspace:** The single `default` workspace stores all specs in `specs/`. `codeRoot` defaults to the repository root (`.`), and `ownership` defaults to `owned`.
- **Storage:** `.specd/changes` tracks in-progress changes, `.specd/drafts` stores shelved drafts, `.specd/discarded` retains abandoned changes, and `.specd/archive` stores permanent records of completed changes.
- **Approvals:** Both approval gates (`spec` and `signoff`) are disabled by default (`false`). Transitions require no manual sign-off.

---

## Example 2: Single-Repo with Local Custom Schema

Use this setup when your team has custom workflow steps, unique artifact types, or specialized validation rules defined locally in the repository rather than from an npm package.

### Directory structure

```
.specd/
└── schemas/
    └── custom-workflow/
        ├── schema.yaml
        └── templates/
            ├── proposal.md
            ├── spec.md
            └── tasks.md
```

### `specd.yaml`

```yaml
schema: 'custom-workflow' # Resolves to .specd/schemas/custom-workflow/schema.yaml

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    schemas:
      adapter: fs
      fs:
        path: .specd/schemas # Optional: this is the default path for 'default'

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
```

### Key behaviors

- **Schema reference:** Bare names (e.g. `'custom-workflow'`) or hashed names (e.g. `'#custom-workflow'`) resolve against `schemas.adapter.fs.path` of the `default` workspace.
- **Local versioning:** The schema is committed and versioned alongside your application code. Updates take effect immediately for new changes.

---

## Example 3: Multi-Workspace Monorepo & Coordinator

Use this pattern in a monorepo where a top-level `default` workspace coordinates multiple packages (e.g. `packages/core`, `packages/cli`, `apps/web`), each having its own independent spec folder and code root.

### `specd.yaml`

```yaml
schema: '@specd/schema-std'

workspaces:
  # The default workspace covers root-level scripts, configs, and shared global specs.
  # Because codeRoot defaults to '.' (the repo root), it physically encloses all child packages.
  # We MUST exclude child directories in graph.excludePaths so the graph engine does not
  # discover their files twice (once under default and once under the child workspace).
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs/_global
    codeRoot: .
    ownership: owned
    graph:
      excludePaths:
        - node_modules/
        - .git/
        - .specd/
        - dist/
        - build/
        - coverage/
        - packages/ # Indexed independently by child workspaces below
        - apps/ # Indexed independently by child workspaces below
        - specs/
        - specd-sdd/

  core:
    specs:
      adapter: fs
      fs:
        path: specs/core
    codeRoot: packages/core
    ownership: owned
    contextIncludeSpecs:
      - 'core:composition'

  cli:
    specs:
      adapter: fs
      fs:
        path: specs/cli
    codeRoot: packages/cli
    ownership: owned

  platform:
    specs:
      adapter: fs
      fs:
        path: ../platform-core/specs
    codeRoot: ../platform-core
    ownership: readOnly # Read-only: context only, modifications rejected

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
      pattern: '{{year}}/{{change.archivedName}}'
```

### Key behaviors

- **Monorepo root exclusion pattern:** In monorepos where `workspaces.default.codeRoot` is `.` (the project root), SpecD's file discovery traverses the entire project tree under `default`. If child workspaces define their own `codeRoot` (such as `packages/core` or `packages/cli`), their source files would be indexed twice, causing symbol duplicate errors and inflated graph databases. Listing `packages/` and `apps/` in `workspaces.default.graph.excludePaths` ensures child packages are only indexed under their dedicated workspaces.
- **`ownership: readOnly`:** The coordinator can include specs from `platform` into compiled context for AI agents, but SpecD rejects changes that propose mutations to `platform` specs.
- **`prefix: _global`:** Specs located under `specs/_global/architecture.md` are referenced with ID `default:_global/architecture`.
- **Targeted context filters:** When `core` is active in a change, its `composition` specs are automatically pulled into context.
- **Yearly archive folders:** Changes archive into `.specd/archive/2026/2026-09-24-my-change/`.

---

## Example 4: Enterprise Governance, Approvals & Lifecycle Hooks

Use this setup for mission-critical repositories where changes require human sign-off gates, audit trails with privacy obfuscation, and automated shell verification at lifecycle transitions.

### `specd.yaml`

```yaml
schema: '@specd/schema-std'

# Privacy protection for public or semi-private repositories
privacy:
  mode: mask # Partially mask author names and email addresses in manifests
  excludeActors: # Retain explicit automation bot identities verbatim
    - 'specd'
    - 'system@getspecd.dev'
    - 'github-actions[bot]'
  allowedMetadataKeys:
    - 'department'

# Global context guidance for agents
context:
  - file: AGENTS.md
  - instruction: 'Do not modify public API signatures without backward compatibility.'

# Mandatory approval gates
approvals:
  spec: true # Human reviewer must approve specs before 'implementing' state
  signoff: true # Human reviewer must approve verification before 'archivable' state

# Artifact invalidation strategy
invalidationPolicy: downstream # Automatically reopen drifted files and their DAG descendants

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
      pattern: '{{year}}/{{change.name}}/{{change.archivedName}}'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

# Inline schema overrides for lifecycle automation hooks
schemaOverrides:
  append:
    workflow:
      - step: implementing
        hooks:
          pre:
            - id: verify-approval-instruction
              instruction: |
                Confirm human spec approval is recorded in the change manifest before writing code.
      - step: archiving
        hooks:
          pre:
            - id: run-test-suite
              run: 'pnpm test'
          post:
            - id: notify-audit-log
              run: 'node scripts/audit-log.js --change "{{change.name}}" --path "{{change.path}}"'
```

---

## Example 5: Layered Configuration Cascade (`specd.local.yaml`)

Use the configuration cascade to provide personal developer overrides or CI-specific variations without altering the shared `specd.yaml`.

### Base configuration (`specd.yaml`)

```yaml
schema: '@specd/schema-std'

logging:
  level: info

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
  legacy:
    specs:
      adapter: fs
      fs:
        path: legacy/specs/
    codeRoot: legacy/

storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive

context:
  - id: global-rules
    instruction: 'Standard repository conventions apply.'
```

### Local developer override (`specd.local.yaml`)

This file is automatically gitignored by `specd project init`:

```yaml
extends: true # Deep-merge on top of base specd.yaml

logging:
  level: debug # Enable verbose debug logs locally

context:
  - instruction: 'Local dev environment: run integration tests against Docker.'

remove:
  workspaces:
    - legacy # Do not index or load legacy workspace on this dev machine
```

---

## Example 6: Exhaustive Reference Configuration

Below is a complete `specd.yaml` showcasing **every configuration field** supported by the SpecD schema, with detailed comments explaining types, defaults, and runtime effects.

```yaml
# ==============================================================================
# SpecD Master Configuration Reference (Exhaustive)
# ==============================================================================

# 1. Schema Selection (Required)
# Reference to the workflow schema package, local schema (#name), or file path.
# Overridden by environment variable: SPECD_SCHEMA
schema: '@specd/schema-std'

# 2. State & Runtime Paths
# Relative directory paths resolved against the directory containing specd.yaml.
# specdPath: location of workflow directories (changes, drafts, archive)
specdPath: '.specd' # Default: '.specd'

# configPath: location of engine operational data (graph databases, logs, tmp)
configPath: '.specd/config' # Default: '.specd/config'

# 3. VCS Identity Provider
# Forces a specific VCS identity provider ('git', 'hg'). Bypasses auto-detection.
# Overridden by environment variable: SPECD_ACTOR_PROVIDER
actorProvider: 'git'

# 4. Identity Privacy & Obfuscation
# Protects contributor names and emails in public change manifests and archives.
# Overridden by environment variables: SPECD_PRIVACY_MODE, SPECD_PRIVACY_SALT
privacy:
  mode: mask # 'hash' | 'mask' | 'anonymous' (Default: null / none)
  salt: 'secret-hash-salt' # Required when mode is 'hash'
  # Actors exempt from obfuscation. Setting this REPLACES the built-in defaults:
  excludeActors:
    - 'specd' # Built-in default
    - 'system@getspecd.dev' # Built-in default
    - 'ci-bot'
  # Whitelist of metadata keys preserved under privacy mode (all others stripped):
  allowedMetadataKeys:
    - 'team'
    - 'department'

# 5. Logging Configuration
# Controls disk logging threshold at {configPath}/log/specd.log.
# Overridden by environment variable: SPECD_LOG_LEVEL
logging:
  level: info # 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent' (Default: 'info')

# 6. Global Prompt Context
# Content injected at the beginning of prompt context delivered to AI agents.
context:
  - file: AGENTS.md # File path relative to specd.yaml (injected verbatim)
  - id: global-guidance # Optional identifier used for removal in cascade layers
    instruction: 'Prefer editing existing functions over introducing redundant abstractions.'

# 7. Global Spec Inclusion & Exclusion Patterns
# Patterns applied to all compiled contexts across all active changes.
contextIncludeSpecs:
  - 'default:_global/*' # Include all global constraints in every change context
contextExcludeSpecs:
  - 'default:_global/archive-policy' # Exclude specific specs unless directly targeted

# 8. Context Presentation & Optimization
# Spec rendering format in compiled agent prompt context:
# 'summary' (compact catalogue), 'hybrid' (full active specs, summarized deps),
# 'full' (all specs verbatim), 'list' (IDs only).
# Overridden by environment variable: SPECD_CONTEXT_MODE
contextMode: summary # Default: 'summary'

# When true, gates optimizer agent writes to metadata cache.
# Overridden by environment variable: SPECD_LLM_OPTIMIZED
llmOptimizedContext: false # Default: false

# 9. Invalidation Propagation Policy
# Strategy used when change artifacts drift from baseline or are invalidated.
# 'none', 'surgical' (target only), 'downstream' (target + DAG descendants), 'global' (all).
invalidationPolicy: downstream # Default: 'downstream'

# 10. Approval Gates
# When true, requires explicit human review commands before advancing states:
# 'spec': blocks ready -> implementing until 'specd changes approve-spec'
# 'signoff': blocks done -> archivable until 'specd changes signoff'
approvals:
  spec: false # Default: false
  signoff: false # Default: false

# 11. Project-Level Code Graph Indexing
graph:
  includePaths:
    - 'tools/**/*.ts' # Root-level files indexed under reserved 'root:' namespace
  # Setting excludePaths REPLACES the built-in defaults ('node_modules/', '.git/', 'dist/', etc.):
  excludePaths:
    - 'node_modules/'
    - '.git/'
    - '.specd/'
    - 'dist/'
    - 'build/'
    - 'coverage/'
    - '**/*.spec.ts'

# 12. Workspaces Configuration
# Defines repositories and sub-directories containing specs and source code.
workspaces:
  default:
    prefix: _global # Logical prefix prepended to all spec IDs in this workspace
    specs:
      adapter: fs
      fs:
        path: specs/_global # Path to specs folder
    schemas:
      adapter: fs
      fs:
        path: .specd/schemas # Path to local schemas (Default: .specd/schemas)
    codeRoot: . # Implementation source code root (Default: '.' for default)
    ownership: owned # 'owned' | 'shared' | 'readOnly' (Default: 'owned')
    contextIncludeSpecs:
      - 'default:*'
    contextExcludeSpecs:
      - 'default:_global/deprecated/*'
    graph:
      respectGitignore: true # When false, gitignored files are indexed (Default: true)
      # In monorepos where default codeRoot is '.', exclude child workspace folders to avoid duplicate indexing:
      excludePaths:
        - 'packages/'
        - 'apps/'
        - 'temp/'
      allowedPaths: # When defined, restricts discovery to matching paths
        - 'src/**'

  core:
    specs:
      adapter: fs
      fs:
        path: packages/core/specs
    codeRoot: packages/core # Required for non-default workspaces
    ownership: owned
    contextIncludeSpecs:
      - 'core:ports/*'

  external-service:
    specs:
      adapter: fs
      fs:
        path: ../service/specd/specs
    codeRoot: ../service
    ownership: readOnly # Read-only workspace: context-only, cannot be modified

# 13. Storage Configuration
# Persistent storage directories for the change lifecycle stages.
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes # Active changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts # Shelved drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded # Abandoned changes
  archive:
    adapter: fs
    fs:
      path: .specd/archive # Completed changes
      pattern: '{{year}}/{{change.archivedName}}' # Directory template for archives

# 14. Schema Plugins
# Schema extension packages loaded and merged before schemaOverrides.
schemaPlugins:
  - '@specd/plugin-schema-enterprise'

# 15. Inline Schema Overrides
# Declarative modifications to the active schema without forking.
# Supported operations: create, remove, set, append, prepend.
schemaOverrides:
  append:
    workflow:
      - step: implementing
        hooks:
          pre:
            - id: audit-pre-check
              instruction: 'Confirm task list is up to date before editing code.'
      - step: archiving
        hooks:
          pre:
            - id: pre-archive-check
              run: 'pnpm test'
          post:
            - id: post-archive-log
              run: 'echo "Change {{change.name}} successfully archived."'

# 16. Installed Agent Plugins
# Coding assistant plugins registered in this project.
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-copilot'
      config:
        model: 'gpt-4o'
```
