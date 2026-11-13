---
title: Core Config
description: Project-level config shape used by core use cases and adapters.
sidebar_position: 9
---

# Core Config

This document summarizes the project-level config shape used by core use cases and adapters.

## Config file

Core writes and mutates `specd.yaml` through `ConfigWriter` and reads it through `ConfigLoader`.

For plugin management, the relevant section is:

```yaml
configVersion: 2
plugins:
  - name: '@specd/plugin-agent-claude'
  - name: '@specd/plugin-agent-copilot'
    contributions:
      - copilot
  - name: '@specd/plugin-agent-opencode'
    config:
      someKey: someValue
```

## Plugin declaration model

- `plugins` is a flat list. Names are scoped (`@scope/name`).
- Each entry has:
  - `name` (required package name)
  - `config` (optional object)
  - `contributions` (optional id allowlist; when present it must not be empty)

Core guarantees:

- Add or update a declaration by `name`.
- Remove a declaration by `name`. An unknown name is a no-op.
- List the flat declarations.

## Initialization defaults

`InitProject` writes a baseline `specd.yaml` with:

- `schema`
- `workspaces`
- `storage`

Plugin declarations are optional at initialization and are added later by plugin commands or `project init --plugin`.
